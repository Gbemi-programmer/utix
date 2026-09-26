/**
 * Deterministic lifecycle state machine for core records.
 *
 * Core records in Utix (worker jobs, notifications, export envelopes, measured
 * operations) used to carry loose booleans and status strings that every
 * consumer interpreted on its own: a queue status string, a `read` flag, an
 * `expiresAt` timestamp. That made an illegal move — retrying a settled job,
 * marking a purged notification read, re-running a completed reconciliation —
 * silently possible, and it made the UI and the API disagree about what state a
 * record was in.
 *
 * This module replaces those ad-hoc checks with one declarative table per
 * record kind:
 *
 * - every state is named, and terminal states are declared, not inferred;
 * - every legal move is an explicit `(from, event) -> to` rule;
 * - anything not in the table is rejected with a stable code, so the UI, the
 *   contract tests and the worker framework all refuse the same moves;
 * - transitions are pure. The clock, the actor and the reason are supplied by
 *   the caller, so replaying the same calls produces byte-identical records.
 *
 * `core/lifecycle/records.ts` declares the concrete record kinds; nothing here
 * knows about a particular record.
 */

import { isAuditedLifecycleEvent, recordAudit } from "@/core/audit/audit";
import { err, ok, type Result } from "@/core/result/result";
import { emitTelemetry, newCorrelationId } from "@/core/telemetry/telemetry";

/** Stable failure codes. Consumers switch on these, never on English text. */
export type LifecycleErrorCode =
  | "unknown_record_kind"
  | "unknown_state"
  | "unknown_event"
  | "invalid_transition"
  | "terminal_state";

export interface TransitionRule {
  readonly from: string;
  readonly event: string;
  readonly to: string;
}

export interface LifecycleDefinition {
  /** Record kind, e.g. `worker_job`. Appears in telemetry and audit records. */
  readonly name: string;
  /** State a freshly created record starts in. */
  readonly initial: string;
  readonly states: readonly string[];
  /** States from which no event is legal. */
  readonly terminal: readonly string[];
  readonly transitions: readonly TransitionRule[];
}

export interface TransitionContext {
  /** ISO-8601 instant. Injected so a transition is reproducible in a test. */
  readonly at?: string;
  /**
   * Who or what asked for the transition: `account:G…` for a user,
   * `maintainer:…` for a maintainer, anything else for a system actor.
   */
  readonly actor?: string;
  /** Audit scope for the event this transition writes. Defaults to `own`. */
  readonly scope?: "own" | "maintainer";
  /**
   * Forces an audit event even when the event and actor would not warrant one.
   * The worker's manual entry points use it: `retryJob` and `deadLetter` are
   * operator decisions, even though the worker performs them.
   */
  readonly audited?: boolean;
  /** Why the transition was requested. Never free-form user text. */
  readonly reason?: string;
  readonly correlationId?: string;
}

/** One accepted transition. Append-only; this is what an audit trail reads. */
export interface TransitionRecord {
  readonly recordKind: string;
  readonly from: string;
  readonly to: string;
  readonly event: string;
  readonly at: string;
  readonly actor: string;
  readonly reason?: string;
  readonly correlationId: string;
}

export interface TransitionOutcome {
  readonly from: string;
  readonly to: string;
  readonly event: string;
  readonly transition: TransitionRecord;
}

export interface LifecycleView {
  /** Same field name the exported state view uses, so nothing re-labels it. */
  readonly kind: string;
  readonly state: string;
  readonly label: string;
  readonly tone: "success" | "info" | "warning" | "danger" | "muted";
  readonly terminal: boolean;
  /** Events a caller may send from here, in table order. */
  readonly allowedEvents: readonly string[];
}

export interface LifecycleMachine {
  readonly definition: LifecycleDefinition;
  initial(): string;
  isState(value: unknown): value is string;
  isTerminal(state: string): boolean;
  /** Events legal from `state`, in table order. Empty for terminal states. */
  allowedEvents(state: string): string[];
  /** Result of a single rule lookup; never throws. */
  resolve(from: string, event: string): Result<string, LifecycleErrorCode>;
  /** `ok` only when the rule exists; `terminal_state` for a terminal `from`. */
  canTransition(from: string, event: string): Result<true, LifecycleErrorCode>;
  /** Validates an untrusted value (storage, query string, API input). */
  parseState(value: unknown): Result<string, LifecycleErrorCode>;
  view(state: string, labels?: Record<string, string>): LifecycleView;
}

const DEFAULT_ACTOR = "system";

/** Maps the transition context's free-form actor onto an audit actor. */
function actorOf(actor: string | undefined): { kind: "user" | "maintainer" | "system"; id: string } {
  if (!actor || actor === DEFAULT_ACTOR) return { kind: "system", id: DEFAULT_ACTOR };
  if (actor.startsWith("maintainer:")) return { kind: "maintainer", id: actor.slice("maintainer:".length) };
  if (actor.startsWith("account:")) return { kind: "user", id: actor.slice(8) };
  return { kind: "system", id: actor };
}

function validateDefinition(definition: LifecycleDefinition): void {
  const states = new Set(definition.states);
  if (!states.has(definition.initial)) {
    throw new Error(`[lifecycle] ${definition.name}: initial state is not declared`);
  }
  for (const terminal of definition.terminal) {
    if (!states.has(terminal)) {
      throw new Error(`[lifecycle] ${definition.name}: terminal state ${terminal} is not declared`);
    }
  }
  for (const rule of definition.transitions) {
    if (!states.has(rule.from) || !states.has(rule.to)) {
      throw new Error(`[lifecycle] ${definition.name}: rule ${rule.from}-${rule.event}->${rule.to} leaves the declared states`);
    }
    if (definition.terminal.includes(rule.from)) {
      throw new Error(`[lifecycle] ${definition.name}: rule ${rule.from}-${rule.event}->${rule.to} leaves a terminal state`);
    }
  }
  // Duplicate (from, event) pairs make the outcome order-dependent, which is
  // exactly the non-determinism this module exists to remove.
  const seen = new Set<string>();
  for (const rule of definition.transitions) {
    const key = `${rule.from}|${rule.event}`;
    if (seen.has(key)) {
      throw new Error(`[lifecycle] ${definition.name}: duplicate rule for ${key}`);
    }
    seen.add(key);
  }
}

/** Builds an immutable machine from a declarative table. */
export function createLifecycle(definition: LifecycleDefinition): LifecycleMachine {
  validateDefinition(definition);
  const terminal = new Set(definition.terminal);
  const states = new Set(definition.states);
  const rules = new Map<string, TransitionRule>();
  const order = new Map<string, string[]>();

  for (const rule of definition.transitions) {
    rules.set(`${rule.from}|${rule.event}`, rule);
    const events = order.get(rule.from) ?? [];
    events.push(rule.event);
    order.set(rule.from, events);
  }

  function isState(value: unknown): value is string {
    return typeof value === "string" && states.has(value);
  }

  function resolve(from: string, event: string): Result<string, LifecycleErrorCode> {
    if (!isState(from)) return err("unknown_state");
    if (typeof event !== "string" || event.length === 0) return err("unknown_event");
    const rule = rules.get(`${from}|${event}`);
    if (!rule) {
      return err(terminal.has(from) ? "terminal_state" : "invalid_transition");
    }
    return ok(rule.to);
  }

  return {
    definition,

    initial(): string {
      return definition.initial;
    },

    isState,

    isTerminal(state: string): boolean {
      return terminal.has(state);
    },

    allowedEvents(state: string): string[] {
      if (!isState(state)) return [];
      return [...(order.get(state) ?? [])];
    },

    resolve,

    canTransition(from: string, event: string): Result<true, LifecycleErrorCode> {
      const resolved = resolve(from, event);
      return resolved.ok ? ok(true) : resolved;
    },

    parseState(value: unknown): Result<string, LifecycleErrorCode> {
      return isState(value) ? ok(value) : err("unknown_state");
    },

    view(state: string, labels = {}): LifecycleView {
      const safeState = isState(state) ? state : "unknown";
      return {
        kind: definition.name,
        state: safeState,
        label: labels[safeState] ?? safeState.replace(/_/g, " "),
        tone: toneFor(safeState),
        terminal: terminal.has(safeState),
        allowedEvents: this.allowedEvents(safeState)
      };
    }
  };
}

function toneFor(state: string): LifecycleView["tone"] {
  switch (state) {
    case "succeeded":
    case "completed":
    case "read":
    case "passed":
    case "reported":
      return "success";
    case "running":
    case "queued":
    case "pending":
    case "generated":
    case "unread":
      return "info";
    case "retrying":
    case "retrying_later":
    case "skipped":
    case "collected":
    case "expired":
      return "warning";
    case "failed":
    case "dead_lettered":
    case "purged":
    case "revoked":
      return "danger";
    default:
      return "muted";
  }
}

/** Anything a record needs to be addressable in a transition record. */
export interface LifecycleRecord {
  readonly id: string;
  readonly state: string;
}

export type ApplyTransitionOptions = TransitionContext;

/**
 * The single entry point every mutating path uses. Validates the state, looks
 * the rule up, stamps the transition and emits `lifecycle.transition` telemetry
 * — a transition that affects a user or a job is never a silent field write.
 */
export function applyTransition(
  machine: LifecycleMachine,
  record: LifecycleRecord,
  event: string,
  options: ApplyTransitionOptions = {}
): Result<TransitionOutcome, LifecycleErrorCode> {
  const parsed = machine.parseState(record.state);
  if (!parsed.ok) return parsed;
  const resolved = machine.resolve(parsed.value, event);
  if (!resolved.ok) {
    // A refused move is sensitive: someone tried to do something the record may
    // not do, and a reviewer needs to know who and what.
    recordAudit({
      action: "record.transition_denied",
      actor: actorOf(options.actor),
      scope: options.scope,
      target: { kind: machine.definition.name, id: record.id },
      reason: options.reason,
      outcome: "denied",
      after: { from: parsed.value, event },
      at: options.at,
      correlationId: options.correlationId,
      errorCode: resolved.code
    });
    emitTelemetry({
      op: "lifecycle.transition_rejected",
      actorType: "system",
      result: "failure",
      errorCode: resolved.code,
      correlationId: options.correlationId,
      payload: {
        recordKind: machine.definition.name,
        recordId: record.id,
        from: parsed.value,
        event
      }
    });
    return resolved;
  }

  const transition: TransitionRecord = {
    recordKind: machine.definition.name,
    from: parsed.value,
    to: resolved.value,
    event,
    at: options.at ?? new Date().toISOString(),
    actor: options.actor ?? DEFAULT_ACTOR,
    reason: options.reason,
    correlationId: options.correlationId ?? newCorrelationId()
  };

  const auditActor = actorOf(options.actor);
  if (options.audited || isAuditedLifecycleEvent(event, auditActor.kind)) {
    recordAudit({
      action: "record.state_changed",
      actor: auditActor,
      scope: options.scope,
      target: { kind: machine.definition.name, id: record.id },
      reason: options.reason,
      before: { state: transition.from },
      after: { state: transition.to, event },
      at: transition.at,
      correlationId: transition.correlationId
    });
  }

  emitTelemetry({
    op: "lifecycle.transition",
    actorType: "system",
    correlationId: transition.correlationId,
    payload: {
      recordKind: transition.recordKind,
      recordId: record.id,
      from: transition.from,
      to: transition.to,
      event: transition.event
    }
  });

  return ok({ from: transition.from, to: transition.to, event, transition });
}

/** Every `(from, event) -> to` the table allows. Used by the transition tests. */
export function allowedTransitions(
  machine: LifecycleMachine
): { from: string; event: string; to: string }[] {
  return machine.definition.transitions.map((rule) => ({
    from: rule.from,
    event: rule.event,
    to: rule.to
  }));
}

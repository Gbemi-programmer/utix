/**
 * Quota controls for expensive operations.
 *
 * Some Utix operations cost real resources every time they run: issuing a
 * ticket writes durable storage, a fraud screen spends third-party API quota, a
 * Horizon or Soroban RPC call spends a shared rate limit, rebuilding an index
 * burns indexing capacity, generating an export burns compute and storage. A
 * scripted client, a runaway retry loop or a stuck button can each exhaust
 * those resources for everyone.
 *
 * This module is the single gate for them. Its rules:
 *
 * - **every metered operation is declared** in `QUOTA_POLICIES`, with the
 *   resource it consumes, a per-principal limit, an optional global limit and a
 *   window. An operation that is not declared is refused
 *   (`quota_unknown_operation`) rather than silently unmetered;
 * - **both counters must have room**. A principal cannot exhaust the shared
 *   pool, and the shared pool caps the total even across many principals;
 * - **overrides are explicit, bounded and audited**. Only a maintainer can
 *   grant one, it always expires, it can never exceed the policy's hard
 *   ceiling, and granting or revoking it writes an audit event. An override of
 *   `0` blocks a principal outright, which is how a fraud response throttles an
 *   abusive account without a deploy;
 * - **denials speak two languages**. The caller gets a stable code plus a
 *   user-safe detail (operation, retry-after, whether the limit was theirs or
 *   shared) with no counts, limits or other principals in it. Maintainers get
 *   the full picture from `diagnose()`, which is authorized;
 * - **refunds are explicit**. A failed attempt still consumed the resource by
 *   default; a caller refunds only when the work never started.
 *
 * The clock and the storage are injected, so a test can walk a window forward
 * without waiting and get byte-identical diagnostics.
 */

import { recordAudit } from "@/core/audit/audit";
import { err, ok, type Result } from "@/core/result/result";
import { emitTelemetry, newCorrelationId, type ActorType } from "@/core/telemetry/telemetry";

/** Stable failure codes. Consumers switch on these, never on English text. */
export type QuotaErrorCode =
  | "quota_exceeded"
  | "quota_unknown_operation"
  | "quota_invalid_principal"
  | "quota_invalid_cost"
  | "quota_override_denied"
  | "quota_override_invalid"
  | "quota_override_not_found"
  | "quota_diagnostics_denied";

/** What kind of capacity an operation spends. */
export type QuotaResource = "storage" | "compute" | "external_api" | "indexing";

export interface QuotaPolicy {
  /** Dot-separated operation name, the same one telemetry uses. */
  readonly operation: string;
  readonly resource: QuotaResource;
  /** Units one principal may spend per window. */
  readonly limit: number;
  /** Units every principal together may spend per window. */
  readonly globalLimit?: number;
  readonly windowMs: number;
  /** The highest limit an override may set. Defaults to ten times `limit`. */
  readonly maxOverrideLimit?: number;
  /** Maintainer-facing: why this operation is metered. */
  readonly rationale: string;
}

const MINUTE = 60 * 1_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Every metered operation, declared once so docs, tests and callers cannot
 * disagree. Limits are deliberately generous for a real user and tight for a
 * script: a box office issuing tickets for a sold-out event is well inside
 * them, a loop re-issuing the same seat is not.
 */
export const QUOTA_POLICIES: readonly QuotaPolicy[] = [
  {
    operation: "ticket.issue",
    resource: "storage",
    limit: 500,
    globalLimit: 20_000,
    windowMs: HOUR,
    rationale: "Each ticket is a durable record and, on-chain, a funded entry."
  },
  {
    operation: "ticket.transfer",
    resource: "storage",
    limit: 20,
    globalLimit: 5_000,
    windowMs: HOUR,
    rationale: "Rapid transfer chains are the signature of scalping and laundering."
  },
  {
    operation: "ticket.redeem",
    resource: "compute",
    limit: 1_200,
    globalLimit: 50_000,
    windowMs: HOUR,
    rationale: "Scanner devices verify signatures per entry; a replay loop pins the verifier."
  },
  {
    operation: "event.create",
    resource: "storage",
    limit: 10,
    globalLimit: 500,
    windowMs: DAY,
    rationale: "Events allocate inventory, pricing tiers and search entries."
  },
  {
    operation: "event.update",
    resource: "storage",
    limit: 120,
    windowMs: HOUR,
    rationale: "Each update re-validates inventory and fans out holder notifications."
  },
  {
    operation: "fraud.screen",
    resource: "external_api",
    limit: 200,
    globalLimit: 5_000,
    windowMs: HOUR,
    rationale: "Risk scoring is billed per call by the upstream provider."
  },
  {
    operation: "export.generate",
    resource: "compute",
    limit: 20,
    globalLimit: 500,
    windowMs: HOUR,
    rationale: "Exports collect, redact and paginate every record in scope."
  },
  {
    operation: "worker.enqueue",
    resource: "compute",
    limit: 100,
    globalLimit: 2_000,
    windowMs: HOUR,
    rationale: "Background jobs run with retries; each enqueue can cost several executions."
  },
  {
    operation: "notification.publish",
    resource: "storage",
    limit: 60,
    globalLimit: 5_000,
    windowMs: HOUR,
    rationale: "Notifications persist per recipient and are retained until purged."
  },
  {
    operation: "horizon.request",
    resource: "external_api",
    limit: 120,
    globalLimit: 1_000,
    windowMs: MINUTE,
    rationale: "Public Horizon enforces a shared per-IP rate limit."
  },
  {
    operation: "rpc.simulate",
    resource: "external_api",
    limit: 60,
    globalLimit: 500,
    windowMs: MINUTE,
    rationale: "Soroban simulation is the most expensive RPC method."
  },
  {
    operation: "faucet.fund",
    resource: "external_api",
    limit: 5,
    globalLimit: 200,
    windowMs: DAY,
    rationale: "Friendbot funding is rate limited upstream and trivially farmed."
  },
  {
    operation: "index.rebuild",
    resource: "indexing",
    limit: 2,
    globalLimit: 10,
    windowMs: DAY,
    rationale: "A rebuild re-reads every ledger range for an event's tickets."
  },
  {
    operation: "analytics.aggregate",
    resource: "indexing",
    limit: 30,
    globalLimit: 600,
    windowMs: HOUR,
    rationale: "Aggregations scan the operation index for the requested range."
  }
];

/** Storage prefix; the version is bumped if the record shape changes. */
export const QUOTA_STORAGE_PREFIX = "utix:quota:v1:";

/** The longest an override may live. Anything longer is a policy change. */
export const QUOTA_MAX_OVERRIDE_TTL_MS = 7 * DAY;

/** How many recent denials `diagnose()` keeps for a maintainer. */
export const QUOTA_DENIAL_HISTORY = 50;

/** Subject id for the shared, all-principal counter. */
export const QUOTA_GLOBAL_SUBJECT = "*";

const PRINCIPAL_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/;
const REASON_PATTERN = /^[a-z0-9_.:-]{1,64}$/;

export interface QuotaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface QuotaRequest {
  operation: string;
  /** Who is spending: `account:G…`, `device:…`, `organizer:…`. */
  principal: string;
  /** Units to spend. Defaults to 1. A batch of 40 tickets costs 40. */
  cost?: number;
  actorType?: ActorType;
  correlationId?: string;
}

/** Which counter refused the request. */
export type QuotaLimitScope = "principal" | "global";

/**
 * The detail attached to a `quota_exceeded` error. Safe to show a user: it
 * carries no counts, no limits and nothing about any other principal.
 */
export interface QuotaDenial {
  readonly operation: string;
  readonly resource: QuotaResource;
  readonly limitScope: QuotaLimitScope;
  /** Milliseconds until the refusing window resets. `null` when blocked by an override. */
  readonly retryAfterMs: number | null;
  readonly correlationId: string;
}

/** Proof of a successful spend. Pass it to `refund()` if the work never ran. */
export interface QuotaReceipt {
  readonly operation: string;
  readonly principal: string;
  readonly cost: number;
  readonly windowStart: number;
  readonly remaining: number;
  readonly resetAt: string;
  readonly correlationId: string;
}

export interface QuotaOverride {
  readonly operation: string;
  /** A principal, or `*` to change the shared limit. */
  readonly subject: string;
  /** The effective limit while the override is active. `0` blocks the subject. */
  readonly limit: number;
  readonly reason: string;
  readonly grantedBy: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
}

export interface GrantOverrideInput {
  operation: string;
  subject: string;
  limit: number;
  /** Stable reason code, e.g. `event.onsale_peak` or `fraud.block`. */
  reason: string;
  ttlMs: number;
  correlationId?: string;
}

/** Who is asking for an override or for diagnostics. */
export type QuotaActor =
  | { readonly kind: "user"; readonly id: string }
  | { readonly kind: "maintainer"; readonly id: string }
  | { readonly kind: "system"; readonly id?: string };

export interface QuotaUsage {
  readonly operation: string;
  readonly resource: QuotaResource;
  readonly subject: string;
  readonly used: number;
  readonly limit: number;
  readonly policyLimit: number;
  readonly overridden: boolean;
  readonly denied: number;
  readonly windowStart: string;
  readonly resetAt: string;
}

export interface QuotaDenialRecord {
  readonly at: string;
  readonly operation: string;
  readonly principal: string;
  readonly limitScope: QuotaLimitScope;
  readonly cost: number;
  readonly used: number;
  readonly limit: number;
  readonly correlationId: string;
}

/** The maintainer view. Never returned to a user actor. */
export interface QuotaDiagnostics {
  readonly generatedAt: string;
  readonly policies: readonly QuotaPolicy[];
  readonly usage: readonly QuotaUsage[];
  readonly overrides: readonly QuotaOverride[];
  readonly recentDenials: readonly QuotaDenialRecord[];
}

export interface QuotaOptions {
  policies?: readonly QuotaPolicy[];
  /** Injected clock. Defaults to the wall clock. */
  now?: () => number;
  storage?: QuotaStorage;
}

export interface QuotaStore {
  /** Would this spend fit? Spends nothing. */
  check(request: QuotaRequest): Result<QuotaReceipt, QuotaErrorCode, QuotaDenial>;
  /** Spends `cost` against both counters, or neither. */
  consume(request: QuotaRequest): Result<QuotaReceipt, QuotaErrorCode, QuotaDenial>;
  /** Returns a spend whose work never started. Idempotent per receipt. */
  refund(receipt: QuotaReceipt): void;
  /** What a principal has left. Safe to show that principal. */
  remaining(operation: string, principal: string): Result<{ remaining: number; resetAt: string }, QuotaErrorCode>;
  grantOverride(actor: QuotaActor, input: GrantOverrideInput): Result<QuotaOverride, QuotaErrorCode>;
  revokeOverride(
    actor: QuotaActor,
    operation: string,
    subject: string,
    reason: string
  ): Result<QuotaOverride, QuotaErrorCode>;
  /** Maintainer-only view of limits, usage, overrides and recent denials. */
  diagnose(actor: QuotaActor): Result<QuotaDiagnostics, QuotaErrorCode>;
  policy(operation: string): QuotaPolicy | undefined;
  /** Test seam: clears counters, overrides and history. */
  reset(): void;
}

interface Counter {
  windowStart: number;
  used: number;
  denied: number;
}

class MemoryStorage implements QuotaStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

/** An in-memory storage adapter, for tests and headless workers. */
export function createMemoryQuotaStorage(): QuotaStorage {
  return new MemoryStorage();
}

function browserStorage(): QuotaStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    return new MemoryStorage();
  }
  return new MemoryStorage();
}

function isCounter(value: unknown): value is Counter {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Counter>;
  return (
    typeof item.windowStart === "number" &&
    typeof item.used === "number" &&
    typeof item.denied === "number"
  );
}

function isOverride(value: unknown): value is QuotaOverride {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<QuotaOverride>;
  return (
    typeof item.operation === "string" &&
    typeof item.subject === "string" &&
    typeof item.limit === "number" &&
    typeof item.reason === "string" &&
    typeof item.grantedBy === "string" &&
    typeof item.grantedAt === "string" &&
    typeof item.expiresAt === "string"
  );
}

export function isValidPrincipal(principal: unknown): principal is string {
  return typeof principal === "string" && principal !== QUOTA_GLOBAL_SUBJECT && PRINCIPAL_PATTERN.test(principal);
}

function ceilingOf(policy: QuotaPolicy): number {
  return policy.maxOverrideLimit ?? policy.limit * 10;
}

function validatePolicies(policies: readonly QuotaPolicy[]): void {
  const seen = new Set<string>();
  for (const policy of policies) {
    if (seen.has(policy.operation)) {
      throw new Error(`[quota] duplicate policy for ${policy.operation}`);
    }
    seen.add(policy.operation);
    if (!Number.isInteger(policy.limit) || policy.limit < 1) {
      throw new Error(`[quota] ${policy.operation}: limit must be a positive integer`);
    }
    if (policy.globalLimit !== undefined && (!Number.isInteger(policy.globalLimit) || policy.globalLimit < policy.limit)) {
      throw new Error(`[quota] ${policy.operation}: globalLimit must be an integer no smaller than limit`);
    }
    if (!Number.isFinite(policy.windowMs) || policy.windowMs < 1_000) {
      throw new Error(`[quota] ${policy.operation}: windowMs must be at least one second`);
    }
    if (ceilingOf(policy) < policy.limit) {
      throw new Error(`[quota] ${policy.operation}: maxOverrideLimit is below limit`);
    }
  }
}

export function createQuotaStore(options: QuotaOptions = {}): QuotaStore {
  const policies = options.policies ?? QUOTA_POLICIES;
  validatePolicies(policies);
  const byOperation = new Map(policies.map((policy) => [policy.operation, policy]));
  const now = options.now ?? (() => Date.now());
  const storage = options.storage ?? browserStorage();
  // Tracked here rather than enumerated from storage, so a shared
  // `localStorage` never leaks another module's keys into diagnostics.
  const touched = new Set<string>();
  const overrideKeys = new Set<string>();
  const refunded = new Set<string>();
  let denials: QuotaDenialRecord[] = [];

  const counterKey = (operation: string, subject: string) =>
    `${QUOTA_STORAGE_PREFIX}count:${operation}|${subject}`;
  const overrideKey = (operation: string, subject: string) =>
    `${QUOTA_STORAGE_PREFIX}override:${operation}|${subject}`;

  function windowStartOf(policy: QuotaPolicy, at: number): number {
    return Math.floor(at / policy.windowMs) * policy.windowMs;
  }

  function readCounter(policy: QuotaPolicy, subject: string, at: number): Counter {
    const windowStart = windowStartOf(policy, at);
    const raw = storage.getItem(counterKey(policy.operation, subject));
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        // A counter from an earlier window is simply stale: the window rolled.
        if (isCounter(parsed) && parsed.windowStart === windowStart) return parsed;
      } catch {
        // A corrupt counter starts fresh rather than blocking the principal.
      }
    }
    return { windowStart, used: 0, denied: 0 };
  }

  function writeCounter(operation: string, subject: string, counter: Counter): void {
    const key = counterKey(operation, subject);
    touched.add(`${operation}|${subject}`);
    storage.setItem(key, JSON.stringify(counter));
  }

  function readOverride(operation: string, subject: string, at: number): QuotaOverride | undefined {
    const key = overrideKey(operation, subject);
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isOverride(parsed)) return undefined;
      if (Date.parse(parsed.expiresAt) <= at) {
        // Expiry is enforced on read, so a forgotten override cannot outlive
        // its window even if nobody sweeps.
        storage.removeItem(key);
        overrideKeys.delete(`${operation}|${subject}`);
        return undefined;
      }
      return parsed;
    } catch {
      return undefined;
    }
  }

  function effectiveLimit(policy: QuotaPolicy, subject: string, at: number): { limit: number; overridden: boolean } {
    const override = readOverride(policy.operation, subject, at);
    if (override) return { limit: override.limit, overridden: true };
    const limit = subject === QUOTA_GLOBAL_SUBJECT ? policy.globalLimit ?? Infinity : policy.limit;
    return { limit, overridden: false };
  }

  function validate(request: QuotaRequest): Result<{ policy: QuotaPolicy; cost: number }, QuotaErrorCode> {
    const policy = byOperation.get(request.operation);
    if (!policy) return err("quota_unknown_operation");
    if (!isValidPrincipal(request.principal)) return err("quota_invalid_principal");
    const cost = request.cost ?? 1;
    if (!Number.isInteger(cost) || cost < 1) return err("quota_invalid_cost");
    return ok({ policy, cost });
  }

  function evaluate(
    request: QuotaRequest,
    spend: boolean
  ): Result<QuotaReceipt, QuotaErrorCode, QuotaDenial> {
    const correlationId = request.correlationId ?? newCorrelationId();
    const valid = validate(request);
    if (!valid.ok) {
      emitTelemetry({
        op: "quota.consume",
        actorType: request.actorType ?? "user",
        result: "failure",
        correlationId,
        errorCode: valid.code,
        payload: { operation: request.operation }
      });
      return valid;
    }
    const { policy, cost } = valid.value;
    const at = now();
    const own = readCounter(policy, request.principal, at);
    const shared = readCounter(policy, QUOTA_GLOBAL_SUBJECT, at);
    const ownLimit = effectiveLimit(policy, request.principal, at);
    const sharedLimit = effectiveLimit(policy, QUOTA_GLOBAL_SUBJECT, at);
    const resetAtMs = own.windowStart + policy.windowMs;

    // The principal's own counter is checked first: when both are full, the
    // user is told the limit is theirs, which is the more actionable message.
    const refusedBy: QuotaLimitScope | undefined =
      own.used + cost > ownLimit.limit
        ? "principal"
        : shared.used + cost > sharedLimit.limit
          ? "global"
          : undefined;

    if (refusedBy) {
      const counter = refusedBy === "principal" ? own : shared;
      const limit = refusedBy === "principal" ? ownLimit : sharedLimit;
      if (spend) {
        counter.denied += 1;
        writeCounter(policy.operation, refusedBy === "principal" ? request.principal : QUOTA_GLOBAL_SUBJECT, counter);
        denials = [
          ...denials,
          {
            at: new Date(at).toISOString(),
            operation: policy.operation,
            principal: request.principal,
            limitScope: refusedBy,
            cost,
            used: counter.used,
            limit: limit.limit,
            correlationId
          }
        ].slice(-QUOTA_DENIAL_HISTORY);
        emitTelemetry({
          op: "quota.consume",
          actorType: request.actorType ?? "user",
          result: "failure",
          correlationId,
          errorCode: "quota_exceeded",
          payload: {
            operation: policy.operation,
            resource: policy.resource,
            limitScope: refusedBy,
            cost,
            used: counter.used,
            limit: limit.limit,
            overridden: limit.overridden
          }
        });
      }
      // A zero-limit override is a block, not a busy window: waiting for the
      // reset would not help, so no retry-after is promised.
      const blocked = limit.overridden && limit.limit === 0;
      return err("quota_exceeded", {
        operation: policy.operation,
        resource: policy.resource,
        limitScope: refusedBy,
        retryAfterMs: blocked ? null : Math.max(0, counter.windowStart + policy.windowMs - at),
        correlationId
      });
    }

    if (spend) {
      own.used += cost;
      shared.used += cost;
      writeCounter(policy.operation, request.principal, own);
      writeCounter(policy.operation, QUOTA_GLOBAL_SUBJECT, shared);
      emitTelemetry({
        op: "quota.consume",
        actorType: request.actorType ?? "user",
        result: "success",
        correlationId,
        payload: {
          operation: policy.operation,
          resource: policy.resource,
          cost,
          used: own.used,
          limit: ownLimit.limit
        }
      });
    }

    return ok({
      operation: policy.operation,
      principal: request.principal,
      cost,
      windowStart: own.windowStart,
      remaining: Math.max(0, ownLimit.limit - own.used - (spend ? 0 : cost)),
      resetAt: new Date(resetAtMs).toISOString(),
      correlationId
    });
  }

  function requireMaintainer(actor: QuotaActor): actor is { kind: "maintainer"; id: string } {
    return actor.kind === "maintainer" && typeof actor.id === "string" && actor.id.length > 0;
  }

  interface OverrideAudit {
    action: "quota.override_granted" | "quota.override_revoked";
    actor: QuotaActor;
    operation: string;
    subject: string;
    reason: string;
    outcome: "allowed" | "denied";
    after?: Record<string, string | number | boolean | null>;
    correlationId?: string;
    errorCode?: string;
  }

  function auditOverride(entry: OverrideAudit): void {
    const { actor } = entry;
    recordAudit({
      action: entry.action,
      actor:
        actor.kind === "maintainer"
          ? { kind: "maintainer", id: actor.id }
          : actor.kind === "user"
            ? { kind: "user", id: actor.id }
            : { kind: "system", id: actor.id },
      scope: "maintainer",
      target: { kind: "quota_override", id: `${entry.operation}|${entry.subject}` },
      reason: REASON_PATTERN.test(entry.reason) ? entry.reason : undefined,
      outcome: entry.outcome,
      after: entry.after,
      correlationId: entry.correlationId,
      errorCode: entry.errorCode
    });
  }

  return {
    check(request) {
      return evaluate(request, false);
    },

    consume(request) {
      return evaluate(request, true);
    },

    refund(receipt) {
      const policy = byOperation.get(receipt.operation);
      if (!policy) return;
      // A receipt refunds once. The correlation id plus window identifies the
      // spend, so a double refund cannot mint extra quota.
      const token = `${receipt.operation}|${receipt.principal}|${receipt.windowStart}|${receipt.correlationId}`;
      if (refunded.has(token)) return;
      refunded.add(token);
      const at = now();
      // A refund for a window that already rolled over has nothing to return.
      if (windowStartOf(policy, at) !== receipt.windowStart) return;
      for (const subject of [receipt.principal, QUOTA_GLOBAL_SUBJECT]) {
        const counter = readCounter(policy, subject, at);
        counter.used = Math.max(0, counter.used - receipt.cost);
        writeCounter(policy.operation, subject, counter);
      }
      emitTelemetry({
        op: "quota.refund",
        actorType: "system",
        correlationId: receipt.correlationId,
        payload: { operation: receipt.operation, cost: receipt.cost }
      });
    },

    remaining(operation, principal) {
      const policy = byOperation.get(operation);
      if (!policy) return err("quota_unknown_operation");
      if (!isValidPrincipal(principal)) return err("quota_invalid_principal");
      const at = now();
      const counter = readCounter(policy, principal, at);
      const { limit } = effectiveLimit(policy, principal, at);
      return ok({
        remaining: Math.max(0, limit - counter.used),
        resetAt: new Date(counter.windowStart + policy.windowMs).toISOString()
      });
    },

    grantOverride(actor, input) {
      const correlationId = input.correlationId ?? newCorrelationId();
      if (!requireMaintainer(actor)) {
        auditOverride({
          action: "quota.override_granted",
          actor,
          operation: input.operation,
          subject: input.subject,
          reason: input.reason,
          outcome: "denied",
          correlationId,
          errorCode: "quota_override_denied"
        });
        return err("quota_override_denied");
      }
      const policy = byOperation.get(input.operation);
      if (!policy) return err("quota_unknown_operation");
      const subjectValid = input.subject === QUOTA_GLOBAL_SUBJECT || isValidPrincipal(input.subject);
      const limitValid = Number.isInteger(input.limit) && input.limit >= 0 && input.limit <= ceilingOf(policy);
      const ttlValid = Number.isFinite(input.ttlMs) && input.ttlMs > 0 && input.ttlMs <= QUOTA_MAX_OVERRIDE_TTL_MS;
      if (!subjectValid || !limitValid || !ttlValid || !REASON_PATTERN.test(input.reason)) {
        auditOverride({
          action: "quota.override_granted",
          actor,
          operation: input.operation,
          subject: input.subject,
          reason: input.reason,
          outcome: "denied",
          after: { limit: input.limit, ttlMs: input.ttlMs },
          correlationId,
          errorCode: "quota_override_invalid"
        });
        return err("quota_override_invalid");
      }
      const at = now();
      const previous = readOverride(input.operation, input.subject, at);
      const override: QuotaOverride = {
        operation: input.operation,
        subject: input.subject,
        limit: input.limit,
        reason: input.reason,
        grantedBy: actor.id,
        grantedAt: new Date(at).toISOString(),
        expiresAt: new Date(at + input.ttlMs).toISOString()
      };
      storage.setItem(overrideKey(input.operation, input.subject), JSON.stringify(override));
      overrideKeys.add(`${input.operation}|${input.subject}`);
      auditOverride({
        action: "quota.override_granted",
        actor,
        operation: input.operation,
        subject: input.subject,
        reason: input.reason,
        outcome: "allowed",
        after: {
          limit: override.limit,
          previousLimit: previous?.limit ?? null,
          policyLimit: input.subject === QUOTA_GLOBAL_SUBJECT ? policy.globalLimit ?? null : policy.limit,
          expiresAt: override.expiresAt
        },
        correlationId
      });
      emitTelemetry({
        op: "quota.override",
        actorType: "user",
        correlationId,
        payload: { operation: override.operation, limit: override.limit, action: "grant" }
      });
      return ok(override);
    },

    revokeOverride(actor, operation, subject, reason) {
      if (!requireMaintainer(actor)) {
        auditOverride({
          action: "quota.override_revoked",
          actor,
          operation,
          subject,
          reason,
          outcome: "denied",
          errorCode: "quota_override_denied"
        });
        return err("quota_override_denied");
      }
      if (!REASON_PATTERN.test(reason)) return err("quota_override_invalid");
      const existing = readOverride(operation, subject, now());
      if (!existing) return err("quota_override_not_found");
      storage.removeItem(overrideKey(operation, subject));
      overrideKeys.delete(`${operation}|${subject}`);
      auditOverride({
        action: "quota.override_revoked",
        actor,
        operation,
        subject,
        reason,
        outcome: "allowed",
        after: { limit: existing.limit, grantedBy: existing.grantedBy }
      });
      return ok(existing);
    },

    diagnose(actor) {
      if (!requireMaintainer(actor)) return err("quota_diagnostics_denied");
      const at = now();
      const usage: QuotaUsage[] = [];
      for (const entry of [...touched].sort()) {
        const separator = entry.lastIndexOf("|");
        const operation = entry.slice(0, separator);
        const subject = entry.slice(separator + 1);
        const policy = byOperation.get(operation);
        if (!policy) continue;
        const counter = readCounter(policy, subject, at);
        // Rolled-over counters with nothing to report are noise.
        if (counter.used === 0 && counter.denied === 0) continue;
        const { limit, overridden } = effectiveLimit(policy, subject, at);
        usage.push({
          operation,
          resource: policy.resource,
          subject,
          used: counter.used,
          limit,
          policyLimit: subject === QUOTA_GLOBAL_SUBJECT ? policy.globalLimit ?? Infinity : policy.limit,
          overridden,
          denied: counter.denied,
          windowStart: new Date(counter.windowStart).toISOString(),
          resetAt: new Date(counter.windowStart + policy.windowMs).toISOString()
        });
      }
      const overrides: QuotaOverride[] = [];
      for (const entry of [...overrideKeys].sort()) {
        const separator = entry.lastIndexOf("|");
        const active = readOverride(entry.slice(0, separator), entry.slice(separator + 1), at);
        if (active) overrides.push(active);
      }
      return ok({
        generatedAt: new Date(at).toISOString(),
        policies,
        usage,
        overrides,
        recentDenials: denials
      });
    },

    policy(operation) {
      return byOperation.get(operation);
    },

    reset() {
      for (const entry of touched) {
        const separator = entry.lastIndexOf("|");
        storage.removeItem(counterKey(entry.slice(0, separator), entry.slice(separator + 1)));
      }
      for (const entry of overrideKeys) {
        const separator = entry.lastIndexOf("|");
        storage.removeItem(overrideKey(entry.slice(0, separator), entry.slice(separator + 1)));
      }
      touched.clear();
      overrideKeys.clear();
      refunded.clear();
      denials = [];
    }
  };
}

export interface WithQuotaRequest<T, C extends string> extends QuotaRequest {
  run: () => Result<T, C> | Promise<Result<T, C>>;
  /**
   * Refund when `run` fails with one of these codes: the work was refused
   * before it spent anything (validation, authorization). Any other failure
   * keeps the spend, so a failing loop still runs out of quota.
   */
  refundOn?: readonly C[];
}

/**
 * Spends quota, runs the work, and refunds only when the work provably did not
 * start. A thrown error keeps the spend: it is the runaway case quota exists for.
 */
export async function withQuota<T, C extends string>(
  store: QuotaStore,
  request: WithQuotaRequest<T, C>
): Promise<Result<T, C | QuotaErrorCode, QuotaDenial | undefined>> {
  const { run, refundOn, ...quotaRequest } = request;
  const receipt = store.consume(quotaRequest);
  if (!receipt.ok) return receipt;
  const outcome = await run();
  if (!outcome.ok && refundOn?.includes(outcome.code)) store.refund(receipt.value);
  return outcome as Result<T, C | QuotaErrorCode, QuotaDenial | undefined>;
}

/** What a user sees. No limits, counts, or other principals. */
export interface QuotaUserMessage {
  readonly title: string;
  readonly message: string;
  /** Whole seconds, rounded up. `null` when waiting will not help. */
  readonly retryAfterSeconds: number | null;
}

const RESOURCE_NOUN: Record<QuotaResource, string> = {
  storage: "requests of this kind",
  compute: "requests of this kind",
  external_api: "lookups",
  indexing: "rebuild or analysis requests"
};

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Maps a quota failure onto copy a user can act on. Maintainers look up the
 * correlation id in `diagnose()`; the user never sees internal numbers.
 */
export function describeQuotaError(code: QuotaErrorCode, denial?: QuotaDenial): QuotaUserMessage {
  if (code !== "quota_exceeded" || !denial) {
    return {
      title: "Request not accepted",
      message:
        code === "quota_override_denied" || code === "quota_diagnostics_denied"
          ? "You do not have permission to do that."
          : "This request could not be processed. Please try again or contact support.",
      retryAfterSeconds: null
    };
  }
  const reference = ` Reference: ${denial.correlationId}.`;
  if (denial.retryAfterMs === null) {
    return {
      title: "Action unavailable",
      message: `This action is currently unavailable for your account. Contact support if you think this is a mistake.${reference}`,
      retryAfterSeconds: null
    };
  }
  const seconds = Math.max(1, Math.ceil(denial.retryAfterMs / 1_000));
  if (denial.limitScope === "global") {
    return {
      title: "Busy right now",
      message: `We are handling a lot of ${RESOURCE_NOUN[denial.resource]} at the moment. Please try again in ${formatWait(seconds)}.${reference}`,
      retryAfterSeconds: seconds
    };
  }
  return {
    title: "Limit reached",
    message: `You have made too many ${RESOURCE_NOUN[denial.resource]} recently. You can try again in ${formatWait(seconds)}.${reference}`,
    retryAfterSeconds: seconds
  };
}

/** Narrowing helper for a failed result carrying a quota denial. */
export function isQuotaDenial(value: unknown): value is QuotaDenial {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<QuotaDenial>;
  return (
    typeof item.operation === "string" &&
    typeof item.resource === "string" &&
    (item.limitScope === "principal" || item.limitScope === "global") &&
    typeof item.correlationId === "string"
  );
}

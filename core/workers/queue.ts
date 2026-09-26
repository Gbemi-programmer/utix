/**
 * Background worker framework for delayed and retryable work.
 *
 * Jobs run outside request handlers with a defined payload format, a retry
 * budget and a dead-letter store, so a task that keeps failing preserves enough
 * context to debug instead of being silently dropped.
 *
 * The queue is deliberately in-memory and dependency-free. Work in this app is
 * initiated client-side, so `drainDueJobs()` is called when a path wants its
 * due work executed; a job is never run twice for the same payload, and
 * reprocessing a job by id is idempotent (a finished job is left untouched).
 *
 * A job's status is not a free-form string: every move goes through the
 * `worker_job` lifecycle table in `core/lifecycle/records.ts`. The framework
 * therefore cannot re-queue a settled job, and a job view rendered anywhere in
 * the UI reads its state from the same table the worker uses.
 */

import {
  createIdempotencyStore,
  type IdempotencyErrorCode,
  type IdempotencyRecord,
  type IdempotencyStore
} from "@/core/idempotency/idempotency";
import { applyTransition, type LifecycleErrorCode } from "@/core/lifecycle/lifecycle";
import { workerJobMachine } from "@/core/lifecycle/records";
import {
  createMemoryQuotaStorage,
  createQuotaStore,
  type QuotaErrorCode,
  type QuotaStore
} from "@/core/quota/quota";
import { err, ok, type Result } from "@/core/result/result";
import { emitTelemetry, newCorrelationId } from "@/core/telemetry/telemetry";

/** The states the `worker_job` lifecycle declares, in table order. */
export const JOB_STATUSES = ["queued", "running", "retrying", "succeeded", "dead_lettered"] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** Codes a rejected job transition can produce. */
export type JobTransitionCode = LifecycleErrorCode;

export interface JobPayload {
  readonly id: string;
  /** Stable, dot-separated operation the handler registered under. */
  readonly operation: string;
  readonly params: Record<string, unknown>;
  /**
   * When set, enqueueing another job with the same key is a no-op for as long
   * as the original job is still queued — the idempotent reprocess.
   */
  readonly dedupeKey?: string;
  readonly maxAttempts: number;
  attempts: number;
  status: JobStatus;
  readonly enqueuedAt: string;
  /** When `status` is `retrying`, the earliest time the job may run again. */
  nextAttemptAt?: string;
  /** Serializable failure context — code plus message, never secrets. */
  lastError?: { code: string; message: string };
  readonly correlationId: string;
}

export interface JobInput {
  operation: string;
  params?: Record<string, unknown>;
  dedupeKey?: string;
  maxAttempts?: number;
  correlationId?: string;
  /** When set, the first run is scheduled this many ms after enqueueing. */
  delayMs?: number;
  /**
   * Idempotency key for the enqueue itself. Use `submit()` rather than
   * `enqueue()` when a retry must not create a second job.
   */
  idempotencyKey?: string;
  /**
   * Who the `worker.enqueue` quota is charged to on `submit()`. Defaults to
   * `system:worker`, a single allowance shared by every unattributed caller.
   */
  principal?: string;
}

export interface SubmitResult {
  readonly job: JobPayload;
  /** True when the key replayed a recorded outcome instead of enqueueing. */
  readonly replayed: boolean;
  readonly record: IdempotencyRecord<{ jobId: string }>;
}

export interface WorkerContext {
  correlationId: string;
  attempt: number;
}

export type JobHandler = (
  params: Record<string, unknown>,
  context: WorkerContext
) => void | Promise<void>;

export interface RetryPolicy {
  /** Base delay in ms; the nth retry waits `retryDelayMs * 2^(n - 1)`. */
  retryDelayMs: number;
  /** Total attempts including the first, after which a job is dead-lettered. */
  maxAttempts: number;
  /** How long a recorded enqueue outcome stays replayable. */
  idempotencyTtlMs: number;
}

export interface RunSummary {
  ran: number;
  succeeded: number;
  failed: number;
  retried: number;
  deadLettered: number;
}

const DEFAULT_POLICY: RetryPolicy = {
  retryDelayMs: 250,
  maxAttempts: 3,
  idempotencyTtlMs: 24 * 60 * 60 * 1_000
};

export interface WorkerFramework {
  register(operation: string, handler: JobHandler, policy?: Partial<RetryPolicy>): void;
  enqueue(input: JobInput): JobPayload;
  /**
   * The high-risk write path: enqueues under an idempotency key so a retried
   * submission replays the original job instead of creating a duplicate.
   */
  submit(input: JobInput): Result<SubmitResult, IdempotencyErrorCode | QuotaErrorCode>;
  /** The quota store `submit()` charges. */
  quota(): QuotaStore;
  /** The idempotency records this framework has persisted. */
  idempotency(): IdempotencyStore;
  /** Executes every due job once and returns the lifecycle summary. */
  drainDueJobs(now?: number): RunSummary;
  /** Idempotent reprocess of a single job by id. */
  processJob(id: string): RunSummary;
  /**
   * Resets a `retrying` job to a fresh queued state. A settled job
   * (`succeeded` / `dead_lettered`) is refused with `terminal_state` — the same
   * code the lifecycle table returns — instead of silently running again.
   */
  retryJob(id: string): Result<JobPayload, JobTransitionCode>;
  deadLetter(id: string): Result<JobPayload, JobTransitionCode>;
  /** Asks the lifecycle table whether `event` is legal for a job in `status`. */
  canTransition(status: string, event: string): Result<true, JobTransitionCode>;
  inspect(status?: JobStatus): JobPayload[];
  getById(id: string): JobPayload | undefined;
  /** Test seam: clears the queue and all registrations. */
  reset(): void;
}

/** Exponential backoff: `delay * 2^(attempt - 1)`, capped to avoid overflow. */
export function retryBackoff(baseDelayMs: number, attempt: number): number {
  const factor = 2 ** Math.min(attempt - 1, 30);
  return baseDelayMs * factor;
}

function errorCodeOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return error instanceof Error ? error.name : "unknown";
}

function findingDedupe(jobs: Map<string, JobPayload>, key: string): JobPayload | undefined {
  for (const job of jobs.values()) {
    if (job.dedupeKey === key && (job.status === "queued" || job.status === "retrying")) {
      return job;
    }
  }
  return undefined;
}

export interface WorkerFrameworkOptions {
  /** Quota store charged by `submit()`. Defaults to an isolated in-memory one. */
  quota?: QuotaStore;
}

export function createWorkerFramework(
  policy: Partial<RetryPolicy> = {},
  options: WorkerFrameworkOptions = {}
): WorkerFramework {
  const mergedPolicy: RetryPolicy = { ...DEFAULT_POLICY, ...policy };
  const registrations = new Map<string, { handler: JobHandler; retryDelayMs: number; maxAttempts: number }>();
  const jobs = new Map<string, JobPayload>();
  const idempotencyStore = createIdempotencyStore({ ttlMs: mergedPolicy.idempotencyTtlMs });
  const quotaStore = options.quota ?? createQuotaStore({ storage: createMemoryQuotaStorage() });

  /**
   * The only place a job's status changes. Anything the `worker_job` table does
   * not allow is refused, so the queue cannot reach a state no consumer expects.
   */
  function move(
    job: JobPayload,
    event: string,
    reason: string,
    /** Set by the manual entry points: an operator asked, not the worker. */
    audited = false
  ): Result<JobStatus, JobTransitionCode> {
    const outcome = applyTransition(
      workerJobMachine,
      { id: job.id, state: job.status },
      event,
      { actor: "worker", reason, correlationId: job.correlationId, audited }
    );
    if (!outcome.ok) return outcome;
    job.status = outcome.value.to as JobStatus;
    return ok(job.status);
  }

  function isDue(job: JobPayload, now: number): boolean {
    if (job.status !== "queued" && job.status !== "retrying") return false;
    if (job.nextAttemptAt === undefined) return true;
    return Date.parse(job.nextAttemptAt) <= now;
  }

  function runJob(job: JobPayload): void {
    job.attempts += 1;
    const registration = registrations.get(job.operation);

    if (!registration) {
      job.lastError = {
        code: "unregistered",
        message: `No handler registered for ${job.operation}`
      };
      move(job, "dead_letter", "unregistered_handler");
      emitTelemetry({
        op: "worker.exhausted",
        actorType: "worker",
        result: "failure",
        correlationId: job.correlationId,
        errorCode: "unregistered"
      });
      return;
    }

    move(job, "start", "drained");
    try {
      registration.handler(job.params, {
        correlationId: job.correlationId,
        attempt: job.attempts
      });
      move(job, "succeed", "handler_returned");
      job.lastError = undefined;
      emitTelemetry({
        op: "worker.run",
        actorType: "worker",
        result: "success",
        correlationId: job.correlationId,
        payload: { operation: job.operation, attempt: job.attempts }
      });
    } catch (error) {
      const code = errorCodeOf(error);
      job.lastError = {
        code,
        message: error instanceof Error ? error.message : "unknown failure"
      };

      // The job's own budget wins; the registration only supplies the default.
      if (job.attempts >= job.maxAttempts) {
        move(job, "exhaust", "attempts_exhausted");
        emitTelemetry({
          op: "worker.exhausted",
          actorType: "worker",
          result: "failure",
          correlationId: job.correlationId,
          errorCode: code,
          payload: { operation: job.operation, attempts: job.attempts }
        });
      } else {
        move(job, "fail", "handler_threw");
        job.nextAttemptAt = new Date(
          Date.now() + retryBackoff(registration.retryDelayMs, job.attempts)
        ).toISOString();
        emitTelemetry({
          op: "worker.retry",
          actorType: "worker",
          result: "failure",
          correlationId: job.correlationId,
          errorCode: code,
          payload: { operation: job.operation, attempt: job.attempts }
        });
      }
    }
  }

  function bumpSummary(summary: RunSummary, job: JobPayload): void {
    if (job.status === "succeeded") summary.succeeded += 1;
    else if (job.status === "retrying") summary.retried += 1;
    else if (job.status === "dead_lettered") summary.deadLettered += 1;
    else summary.failed += 1;
  }

  // Named so `submit()` can reach the public enqueue without re-entering the
  // object literal while it is being built.
  const framework: WorkerFramework = {
    register(operation, handler, custom = {}): void {
      if (registrations.has(operation)) {
        throw new Error(`[workers] handler already registered for ${operation}`);
      }
      registrations.set(operation, {
        handler,
        retryDelayMs: custom.retryDelayMs ?? mergedPolicy.retryDelayMs,
        maxAttempts: custom.maxAttempts ?? mergedPolicy.maxAttempts
      });
    },

    enqueue(input: JobInput): JobPayload {
      if (input.dedupeKey) {
        const existing = findingDedupe(jobs, input.dedupeKey);
        if (existing) return existing;
      }

      const job: JobPayload = {
        id: newCorrelationId(),
        operation: input.operation,
        params: input.params ?? {},
        dedupeKey: input.dedupeKey,
        maxAttempts: input.maxAttempts ?? mergedPolicy.maxAttempts,
        attempts: 0,
        // The initial state comes from the lifecycle table, not from a literal
        // repeated here.
        status: workerJobMachine.initial() as JobStatus,
        enqueuedAt: new Date().toISOString(),
        nextAttemptAt:
          input.delayMs && input.delayMs > 0
            ? new Date(Date.now() + input.delayMs).toISOString()
            : undefined,
        correlationId: input.correlationId ?? newCorrelationId()
      };
      jobs.set(job.id, job);
      return job;
    },

    submit(input: JobInput): Result<SubmitResult, IdempotencyErrorCode | QuotaErrorCode> {
      const begun = idempotencyStore.begin({
        key: input.idempotencyKey,
        operation: "worker.enqueue",
        request: {
          operation: input.operation,
          params: input.params ?? {},
          dedupeKey: input.dedupeKey ?? null,
          maxAttempts: input.maxAttempts ?? mergedPolicy.maxAttempts,
          delayMs: input.delayMs ?? null
        },
        correlationId: input.correlationId
      });
      if (!begun.ok) return begun;

      if (begun.value.replay) {
        const recorded = begun.value.record as IdempotencyRecord<{ jobId: string }>;
        const jobId = recorded.response?.jobId;
        const job = jobId ? jobs.get(jobId) : undefined;
        if (!job) {
          // The recorded outcome outlived the in-memory job: the caller still
          // gets a consistent answer rather than a second enqueue.
          return err("idempotency_not_found");
        }
        return ok({ job, replayed: true, record: recorded });
      }

      // A replay above is free; only a submission that creates a job is charged.
      const charged = quotaStore.consume({
        operation: "worker.enqueue",
        principal: input.principal ?? "system:worker",
        actorType: "worker",
        correlationId: input.correlationId
      });
      if (!charged.ok) {
        // Released so the same key can succeed once the window resets.
        idempotencyStore.abandon(input.idempotencyKey!);
        return charged;
      }

      const job = framework.enqueue(input);
      const completed = idempotencyStore.complete(input.idempotencyKey!, { jobId: job.id });
      if (!completed.ok) {
        idempotencyStore.abandon(input.idempotencyKey!);
        return completed;
      }
      return ok({ job, replayed: false, record: completed.value });
    },

    quota(): QuotaStore {
      return quotaStore;
    },

    idempotency(): IdempotencyStore {
      return idempotencyStore;
    },

    drainDueJobs(now = Date.now()): RunSummary {
      const summary: RunSummary = { ran: 0, succeeded: 0, failed: 0, retried: 0, deadLettered: 0 };
      const due = [...jobs.values()].filter((job) => isDue(job, now));

      for (const job of due) {
        summary.ran += 1;
        runJob(job);
        bumpSummary(summary, job);
      }
      return summary;
    },

    processJob(id: string): RunSummary {
      const summary: RunSummary = { ran: 0, succeeded: 0, failed: 0, retried: 0, deadLettered: 0 };
      const job = jobs.get(id);
      if (!job) return summary;
      // Idempotent reprocessing: a terminal job has no legal `start` event, so
      // it is left untouched instead of running its handler a second time.
      if (workerJobMachine.isTerminal(job.status)) return summary;

      summary.ran += 1;
      runJob(job);
      bumpSummary(summary, job);
      return summary;
    },

    retryJob(id: string): Result<JobPayload, JobTransitionCode> {
      const job = jobs.get(id);
      if (!job) return err("unknown_state");
      const moved = move(job, "retry", "manual_retry", true);
      if (!moved.ok) return moved;
      job.nextAttemptAt = undefined;
      job.attempts = 0;
      return ok(job);
    },

    deadLetter(id: string): Result<JobPayload, JobTransitionCode> {
      const job = jobs.get(id);
      if (!job) return err("unknown_state");
      const moved = move(job, "dead_letter", "manual_dead_letter", true);
      if (!moved.ok) return moved;
      return ok(job);
    },

    canTransition(status: string, event: string): Result<true, JobTransitionCode> {
      return workerJobMachine.canTransition(status, event);
    },

    inspect(status?: JobStatus): JobPayload[] {
      const all = [...jobs.values()];
      return status ? all.filter((job) => job.status === status) : all;
    },

    getById(id: string): JobPayload | undefined {
      return jobs.get(id);
    },

    reset(): void {
      jobs.clear();
      registrations.clear();
      idempotencyStore.reset();
      // A shared quota store belongs to the caller; only an owned one is cleared.
      if (!options.quota) quotaStore.reset();
    }
  };

  return framework;
}
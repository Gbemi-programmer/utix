/**
 * The reconciliation job itself: a registered, delayed, read-only worker
 * operation that runs a dry-run reconciliation over a snapshot and publishes
 * the report.
 *
 * Two things are deliberate. The handler takes its snapshot from a *provider*
 * rather than reading a store itself, so a dry run in CI can be pointed at a
 * fixture and prove the job never writes. And the report is kept in memory and
 * exposed read-only — the job has no repair step, by design.
 */

import { recordAudit } from "@/core/audit/audit";
import { createLifecycle } from "@/core/lifecycle/lifecycle";
import {
  emitReconciliationTelemetry,
  formatReport,
  reconcile,
  type ReconciliationInput,
  type ReconciliationReport
} from "@/core/reconciliation/reconciliation";
import { ok, type Result } from "@/core/result/result";
import type { WorkerFramework } from "@/core/workers/queue";

/** Operation name the job registers under. */
export const RECONCILIATION_DRY_RUN_OP = "reconciliation.dry_run";

/** Dry runs are cheap; keep them off the critical path. */
export const RECONCILIATION_DRY_RUN_DELAY_MS = 1_000;

/**
 * The lifecycle of a reconciliation run. `reported` is the end of the happy
 * path; `failed` is when the snapshot could not even be read.
 */
export const reconciliationRunMachine = createLifecycle({
  name: "reconciliation_run",
  initial: "pending",
  states: ["pending", "collecting", "analyzing", "reported", "failed", "cancelled"],
  terminal: ["reported", "failed", "cancelled"],
  transitions: [
    { from: "pending", event: "collect", to: "collecting" },
    { from: "pending", event: "cancel", to: "cancelled" },
    { from: "collecting", event: "analyze", to: "analyzing" },
    { from: "collecting", event: "fail", to: "failed" },
    { from: "analyzing", event: "report", to: "reported" },
    { from: "analyzing", event: "fail", to: "failed" }
  ]
});

export type ReconciliationErrorCode = "snapshot_unavailable";

export interface ReconciliationProviders {
  /**
   * Reads a snapshot. Called once per run and never written to; a provider that
   * throws yields `snapshot_unavailable` rather than a partial report.
   */
  read: () => ReconciliationInput;
}

export interface RunDeps {
  framework: WorkerFramework;
  providers: ReconciliationProviders;
  /** Where the last report is kept for a maintainer-facing view. */
  last?: { report?: ReconciliationReport };
  now?: () => number;
}

export interface RunResult {
  readonly report: ReconciliationReport;
  readonly summary: string;
}

/**
 * Registers the dry-run job and returns a `runNow()` that executes it
 * synchronously, which is what a CLI or a test wants. The job itself goes
 * through the worker framework so retries and telemetry stay in one place.
 */
/**
 * A report a maintainer will act on is an audited event. Counts only: the
 * findings themselves stay in the report, not in the trail.
 */
function auditReport(report: ReconciliationReport): void {
  recordAudit({
    action: "reconciliation.reported",
    actor: { kind: "maintainer", id: "reconciliation" },
    scope: "maintainer",
    target: { kind: "reconciliation_run", id: report.runId },
    reason: "dry_run",
    after: {
      findings: report.summary.total,
      inconsistent: report.summary.inconsistent,
      stale: report.summary.stale,
      duplicate: report.summary.duplicate,
      missing: report.summary.missing,
      invariants: report.checks.length,
      clean: report.clean
    },
    at: report.finishedAt,
    correlationId: report.runId
  });
}

export function registerReconciliation(deps: RunDeps): () => Result<RunResult, ReconciliationErrorCode> {
  const { framework, providers } = deps;
  const last = deps.last ?? {};

  function snapshot(): Result<ReconciliationInput, ReconciliationErrorCode> {
    try {
      const input = providers.read();
      if (!input || typeof input.now !== "number") return { ok: false, code: "snapshot_unavailable" };
      return ok(input);
    } catch {
      return { ok: false, code: "snapshot_unavailable" };
    }
  }

  framework.register(
    RECONCILIATION_DRY_RUN_OP,
    (params) => {
      const input = snapshot();
      if (!input.ok) throw Object.assign(new Error("snapshot_unavailable"), { code: "snapshot_unavailable" });

      const at = params?.at;
      const now = typeof at === "number" ? at : input.value.now;
      const report = reconcile({ ...input.value, now });
      last.report = report;
      auditReport(report);
      emitReconciliationTelemetry(report);
    },
    { retryDelayMs: RECONCILIATION_DRY_RUN_DELAY_MS, maxAttempts: 2 }
  );

  return function runNow(at?: number): Result<RunResult, ReconciliationErrorCode> {
    const input = snapshot();
    if (!input.ok) return input;

    const now = at ?? input.value.now;
    const report = reconcile({ ...input.value, now });
    last.report = report;
    auditReport(report);
    emitReconciliationTelemetry(report);
    return ok({ report, summary: formatReport(report) });
  };
}

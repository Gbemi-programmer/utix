/**
 * Maintainer-facing diagnostics for operations that got stuck.
 *
 * The runner deliberately never retries by itself, so an interrupted operation
 * stays visible until somebody acts on it. These helpers turn the records into
 * that list — oldest first, each with the action that unblocks it — plus a
 * copy-pasteable summary for a support thread.
 */

import { nextActionFor } from "@/core/operations/recovery";
import type {
  OperationRecord,
  OperationState,
  RecoveryAction
} from "@/core/operations/types";

/** An unfinished operation untouched for longer than this is worth reporting. */
export const DEFAULT_STUCK_AFTER_MS = 5 * 60 * 1000;

export interface StuckOperation {
  readonly operationId: string;
  readonly kind: string;
  readonly state: OperationState;
  /** Step the operation is parked on, or `null` when it only needs closing out. */
  readonly stuckStepId: string | null;
  readonly ageMs: number;
  readonly lastErrorCode: string | null;
  readonly action: RecoveryAction;
}

export interface DiagnoseOperationsOptions {
  readonly now?: () => number;
  readonly stuckAfterMs?: number;
}

function ageOf(record: OperationRecord, at: number): number {
  const updatedAt = Date.parse(record.updatedAt);
  if (Number.isNaN(updatedAt)) return 0;
  return Math.max(0, at - updatedAt);
}

/** Unfinished operations, oldest first. Finished ones are never reported. */
export function stuckOperations(
  records: readonly OperationRecord[],
  options: DiagnoseOperationsOptions = {}
): StuckOperation[] {
  const at = (options.now ?? (() => Date.now()))();
  const threshold = options.stuckAfterMs ?? DEFAULT_STUCK_AFTER_MS;

  const stuck: StuckOperation[] = [];
  for (const record of records) {
    const action = nextActionFor(record);
    if (action === null) continue;

    const ageMs = ageOf(record, at);
    if (ageMs < threshold) continue;

    stuck.push({
      operationId: record.id,
      kind: record.kind,
      state: record.state,
      stuckStepId: action.stepId,
      ageMs,
      lastErrorCode: record.lastErrorCode ?? null,
      action
    });
  }

  return stuck.sort((left, right) => right.ageMs - left.ageMs);
}

export interface OperationSummary {
  readonly headline: string;
  readonly stepLines: readonly string[];
  readonly nextAction: RecoveryAction | null;
}

/** One record, rendered for a bug report or a support reply. */
export function summarizeOperation(record: OperationRecord): OperationSummary {
  return {
    headline: `${record.kind} ${record.id} — ${record.state} (updated ${record.updatedAt})`,
    stepLines: record.steps.map((checkpoint) => {
      const attempt = checkpoint.attempt === 0 ? "not attempted" : `attempt ${checkpoint.attempt}`;
      const committed = checkpoint.sideEffectCommitted ? ", effect submitted" : "";
      const error = checkpoint.errorCode === undefined ? "" : `, ${checkpoint.errorCode}`;
      return `${checkpoint.id}: ${checkpoint.status} (${attempt}${committed}${error})`;
    }),
    nextAction: nextActionFor(record)
  };
}

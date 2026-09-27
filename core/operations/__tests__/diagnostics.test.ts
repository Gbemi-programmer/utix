import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUCK_AFTER_MS,
  stuckOperations,
  summarizeOperation,
  type OperationRecord,
  type OperationState,
  type StepCheckpoint
} from "@/core/operations";

const NOW = Date.parse("2026-01-01T00:10:00.000Z");

function at(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

function step(
  id: string,
  overrides: Partial<StepCheckpoint> = {}
): StepCheckpoint {
  return {
    id,
    status: "pending",
    attempt: 0,
    idempotencyKey: `operation:${id}:step:${id}`,
    sideEffectCommitted: false,
    updatedAt: at(5),
    ...overrides
  };
}

function record(
  id: string,
  state: OperationState,
  steps: readonly StepCheckpoint[],
  overrides: Partial<OperationRecord> = {}
): OperationRecord {
  return {
    id,
    kind: "ticket_flow",
    state,
    steps,
    correlationId: `corr-${id}`,
    createdAt: at(30),
    updatedAt: at(5),
    ...overrides
  };
}

const DONE = [step("issue", { status: "succeeded", attempt: 1, sideEffectCommitted: true })];

describe("stuckOperations", () => {
  it("reports unfinished operations oldest first, with the action that unblocks them", () => {
    const records = [
      record("op-fresh", "running", [step("issue")], { updatedAt: at(0) }),
      record(
        "op-recent",
        "interrupted",
        [step("issue", { status: "succeeded", attempt: 1, sideEffectCommitted: true }), step("submit", { status: "interrupted", attempt: 1, errorCode: "network" })],
        { updatedAt: at(1), lastErrorCode: "network" }
      ),
      record(
        "op-old",
        "interrupted",
        [
          step("issue", { status: "succeeded", attempt: 1, sideEffectCommitted: true }),
          step("submit", {
            status: "interrupted",
            attempt: 2,
            sideEffectCommitted: true,
            errorCode: "confirmation_timeout"
          })
        ],
        { updatedAt: at(9), lastErrorCode: "confirmation_timeout" }
      ),
      record("op-completed", "completed", DONE, { updatedAt: at(45) }),
      record("op-abandoned", "abandoned", [step("issue")], { updatedAt: at(45) })
    ];

    const stuck = stuckOperations(records, { now: () => NOW, stuckAfterMs: 30_000 });

    expect(stuck.map((entry) => entry.operationId)).toEqual(["op-old", "op-recent"]);
    expect(stuck[0].ageMs).toBe(9 * 60_000);
    expect(stuck[0].state).toBe("interrupted");
    expect(stuck[0].stuckStepId).toBe("submit");
    expect(stuck[0].lastErrorCode).toBe("confirmation_timeout");
    expect(stuck[0].action.code).toBe("confirm_external_state");
    expect(stuck[0].action.idempotencyKey).toBe("operation:submit:step:submit");
    expect(stuck[1].action.code).toBe("retry_step");
    expect(stuck[1].stuckStepId).toBe("submit");
  });

  it("treats a failed operation as needing a decision, not as finished", () => {
    const records = [
      record(
        "op-failed",
        "failed",
        [step("submit", { status: "failed", attempt: 1, errorCode: "insufficient_balance" })],
        { updatedAt: at(10), lastErrorCode: "insufficient_balance" }
      )
    ];

    const stuck = stuckOperations(records, { now: () => NOW });

    expect(stuck).toHaveLength(1);
    expect(stuck[0].action.code).toBe("retry_step");
    expect(stuck[0].lastErrorCode).toBe("insufficient_balance");
  });

  it("flags an operation that only needs closing out", () => {
    const records = [
      record(
        "op-unclosed",
        "running",
        [step("issue", { status: "succeeded", attempt: 1, sideEffectCommitted: true })],
        { updatedAt: at(2) }
      )
    ];

    const stuck = stuckOperations(records, { now: () => NOW, stuckAfterMs: 30_000 });

    expect(stuck).toHaveLength(1);
    expect(stuck[0].stuckStepId).toBeNull();
    expect(stuck[0].action.code).toBe("retry_step");
    expect(stuck[0].action.stepId).toBeNull();
  });

  it("honours the threshold and tolerates an unparseable timestamp", () => {
    const records = [
      record("op-old", "interrupted", [step("submit")], { updatedAt: at(30) }),
      record("op-young", "interrupted", [step("submit")], { updatedAt: at(1) }),
      record("op-broken", "interrupted", [step("submit")], { updatedAt: "not-a-date" })
    ];

    expect(
      stuckOperations(records, { now: () => NOW }).map((entry) => entry.operationId)
    ).toEqual(["op-old"]);

    // A timestamp that cannot be parsed degrades to "just now", never to a
    // negative age, and sorts last.
    const all = stuckOperations(records, { now: () => NOW, stuckAfterMs: 0 });
    expect(all.map((entry) => entry.operationId)).toEqual(["op-old", "op-young", "op-broken"]);
    expect(all[2].ageMs).toBe(0);
    expect(DEFAULT_STUCK_AFTER_MS).toBe(5 * 60_000);
  });
});

describe("summarizeOperation", () => {
  it("renders a headline, one line per step, and the next action", () => {
    const summary = summarizeOperation(
      record(
        "op-1",
        "interrupted",
        [
          step("issue", { status: "succeeded", attempt: 1, sideEffectCommitted: true }),
          step("submit", { status: "running", attempt: 2 }),
          step("confirm", { status: "failed", attempt: 1, errorCode: "rejected" })
        ],
        { updatedAt: at(3), lastErrorCode: "rejected" }
      )
    );

    expect(summary.headline).toBe(`ticket_flow op-1 — interrupted (updated ${at(3)})`);
    expect(summary.stepLines).toEqual([
      "issue: succeeded (attempt 1, effect submitted)",
      "submit: running (attempt 2)",
      "confirm: failed (attempt 1, rejected)"
    ]);
    expect(summary.nextAction?.code).toBe("retry_step");
    expect(summary.nextAction?.stepId).toBe("submit");
  });

  it("has no next action once the operation is closed", () => {
    const summary = summarizeOperation(record("op-1", "completed", DONE));
    expect(summary.nextAction).toBeNull();
  });
});

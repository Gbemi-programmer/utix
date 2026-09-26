import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowedTransitions,
  applyTransition,
  createLifecycle,
  type LifecycleErrorCode,
  type LifecycleMachine
} from "@/core/lifecycle/lifecycle";
import {
  exportEnvelopeMachine,
  notificationMachine,
  operationMachine,
  recordMachine,
  RECORD_MACHINES,
  stateView,
  transitionRecord,
  workerJobMachine
} from "@/core/lifecycle/records";
import { setTelemetrySink, type TelemetryEvent } from "@/core/telemetry/telemetry";
import {
  createWorkerFramework,
  type WorkerFramework
} from "@/core/workers/queue";

/** Every declared machine, so no record kind can ship an unexercised table. */
const machines: [string, LifecycleMachine][] = Object.entries(RECORD_MACHINES);

function capture(): TelemetryEvent[] {
  const events: TelemetryEvent[] = [];
  setTelemetrySink({ emit: (event) => events.push(event) });
  return events;
}

describe("lifecycle state machine", () => {
  it("allows every transition its table declares, for every core record kind", () => {
    for (const [kind, machine] of machines) {
      for (const rule of allowedTransitions(machine)) {
        const outcome = applyTransition(
          machine,
          { id: `${kind}-1`, state: rule.from },
          rule.event,
          { at: "2026-09-26T00:00:00.000Z", actor: "test", correlationId: "corr-1" }
        );
        expect(outcome.ok, `${kind}: ${rule.from} -${rule.event}-> ${rule.to}`).toBe(true);
        if (outcome.ok) {
          expect(outcome.value.to).toBe(rule.to);
          expect(outcome.value.transition.at).toBe("2026-09-26T00:00:00.000Z");
          expect(outcome.value.transition.actor).toBe("test");
          expect(outcome.value.transition.correlationId).toBe("corr-1");
        }
      }
    }
  });

  it("rejects a transition that is not in the table with a stable code", () => {
    // 1. Not a declared event for a live state.
    expect(applyTransition(workerJobMachine, { id: "j1", state: "queued" }, "succeed")).toMatchObject({
      ok: false,
      code: "invalid_transition"
    });
    // 2. Not a declared state at all.
    expect(applyTransition(workerJobMachine, { id: "j1", state: "done" }, "start")).toMatchObject({
      ok: false,
      code: "unknown_state"
    });
    // 3. A terminal state has no legal events.
    expect(
      applyTransition(workerJobMachine, { id: "j1", state: "succeeded" }, "start")
    ).toMatchObject({ ok: false, code: "terminal_state" });
    // 4. A settled operation cannot be re-succeeded.
    expect(
      applyTransition(operationMachine, { id: "o1", state: "succeeded" }, "succeed")
    ).toMatchObject({ ok: false, code: "terminal_state" });
    // 5. A purged notification is gone for good.
    expect(
      applyTransition(notificationMachine, { id: "n1", state: "purged" }, "read")
    ).toMatchObject({ ok: false, code: "terminal_state" });
    // 6. An export envelope cannot be un-expired.
    expect(
      applyTransition(exportEnvelopeMachine, { id: "e1", state: "expired" }, "expire")
    ).toMatchObject({ ok: false, code: "invalid_transition" });
    // 7. An empty event is not an event.
    expect(applyTransition(workerJobMachine, { id: "j1", state: "queued" }, "")).toMatchObject({
      ok: false,
      code: "unknown_event"
    });
    // 8. A record kind nobody declared has no machine.
    expect(recordMachine("nope")).toMatchObject({ ok: false, code: "unknown_record_kind" });
  });

  it("rejects the same illegal move no matter which caller asks", () => {
    const fromWorker = workerJobMachine.canTransition("succeeded", "start");
    const fromQueue = createWorkerFramework().canTransition("succeeded", "start");
    expect(fromWorker).toEqual(fromQueue);
    expect(fromWorker.ok).toBe(false);
  });

  it("emits one telemetry record per accepted transition and one per rejection", () => {
    const events = capture();

    applyTransition(workerJobMachine, { id: "j1", state: "queued" }, "start", {
      at: "2026-09-26T00:00:00.000Z",
      correlationId: "corr-a"
    });
    applyTransition(workerJobMachine, { id: "j1", state: "succeeded" }, "start", {
      correlationId: "corr-a"
    });

    expect(events.map((event) => event.op)).toEqual([
      "lifecycle.transition",
      "lifecycle.transition_rejected"
    ]);
    expect(events[0].payload).toMatchObject({
      recordKind: "worker_job",
      recordId: "j1",
      from: "queued",
      to: "running",
      event: "start"
    });
    expect(events[1].result).toBe("failure");
    expect(events[1].errorCode).toBe("terminal_state");
    expect(events[1].correlationId).toBe("corr-a");
  });

  it("is deterministic: the same calls with the same clock produce the same records", () => {
    const run = () => {
      const first = applyTransition(workerJobMachine, { id: "j1", state: "queued" }, "start", {
        at: "2026-01-01T00:00:00.000Z",
        actor: "worker",
        reason: "drained",
        correlationId: "corr-fixed"
      });
      const second = applyTransition(workerJobMachine, { id: "j1", state: "running" }, "succeed", {
        at: "2026-01-01T00:00:01.000Z",
        actor: "worker",
        reason: "handler_returned",
        correlationId: "corr-fixed"
      });
      return [first, second].map((outcome) => (outcome.ok ? outcome.value.transition : outcome));
    };

    expect(run()).toEqual(run());
  });

  it("refuses to build a machine whose table is ambiguous or reaches an undeclared state", () => {
    const base = {
      name: "bad",
      initial: "a",
      states: ["a", "b"],
      terminal: [] as string[],
      transitions: [{ from: "a", event: "go", to: "b" }]
    };

    // Duplicate (from, event) pair.
    expect(() =>
      createLifecycle({ ...base, transitions: [base.transitions[0], base.transitions[0]] })
    ).toThrow(/duplicate rule/);
    // Rule pointing at a state that was never declared.
    expect(() =>
      createLifecycle({ ...base, transitions: [{ from: "a", event: "go", to: "c" }] })
    ).toThrow(/declared states/);
    // Rule leaving a terminal state.
    expect(() =>
      createLifecycle({ ...base, terminal: ["a"] })
    ).toThrow(/terminal state/);
    // Initial state outside the declared set.
    expect(() => createLifecycle({ ...base, initial: "z" })).toThrow(/initial state/);
  });

  it("derives a UI view and an API state from the same model", () => {
    const view = stateView("worker_job", "retrying");
    expect(view).toMatchObject({
      kind: "worker_job",
      state: "retrying",
      label: "Retrying",
      tone: "warning",
      terminal: false
    });
    expect(view.allowedEvents).toEqual(workerJobMachine.allowedEvents("retrying"));
    // An unknown kind or state degrades instead of throwing in a render path.
    expect(stateView("nope", "queued")).toMatchObject({ state: "unknown", tone: "muted" });
    expect(stateView("worker_job", "nonsense")).toMatchObject({ state: "unknown" });
  });

  it("routes a transition by record kind and refuses an undeclared kind", () => {
    expect(transitionRecord("notification", "n1", "unread", "read", { at: "2026-01-01T00:00:00.000Z" }))
      .toEqual({ ok: true, value: { state: "read", at: "2026-01-01T00:00:00.000Z" } });
    expect(transitionRecord("nope", "x", "unread", "read")).toMatchObject({
      ok: false,
      code: "unknown_record_kind"
    });
  });
});

describe("worker framework lifecycle integration", () => {
  let framework: WorkerFramework;

  beforeEach(() => {
    capture();
    framework = createWorkerFramework();
  });

  it("refuses to re-queue a settled job and keeps its state", () => {
    framework.register("once.only", vi.fn());
    const job = framework.enqueue({ operation: "once.only" });
    framework.drainDueJobs();
    expect(job.status).toBe("succeeded");

    const retried = framework.retryJob(job.id);
    expect(retried.ok).toBe(false);
    if (!retried.ok) expect(retried.code satisfies LifecycleErrorCode).toBe("terminal_state");
    expect(job.status).toBe("succeeded");
    expect(framework.retryJob("missing")).toMatchObject({ ok: false, code: "unknown_state" });
  });

  it("refuses to dead-letter a settled job and accepts it for a live one", () => {
    const live = framework.enqueue({ operation: "widget.process" });
    expect(framework.deadLetter(live.id).ok).toBe(true);
    expect(live.status).toBe("dead_lettered");
    expect(framework.deadLetter(live.id)).toMatchObject({ ok: false, code: "terminal_state" });
  });

  it("only lets a retrying job use the retry event", () => {
    framework.register("flaky.process", () => {
      throw new Error("boom");
    });
    const job = framework.enqueue({ operation: "flaky.process", maxAttempts: 3 });
    expect(framework.retryJob(job.id)).toMatchObject({ ok: false, code: "invalid_transition" });
    framework.drainDueJobs();
    expect(job.status).toBe("retrying");

    const reset = framework.retryJob(job.id);
    expect(reset.ok).toBe(true);
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);
  });

  it("never reaches a state the lifecycle table does not declare", () => {
    framework.register("mixed", () => {
      throw new Error("boom");
    });
    const job = framework.enqueue({ operation: "mixed", maxAttempts: 1 });
    framework.drainDueJobs();

    const observed: string[] = [];
    for (const transition of allowedTransitions(workerJobMachine)) {
      observed.push(transition.to);
    }
    expect(workerJobMachine.isState(job.status)).toBe(true);
    expect(observed).toContain(job.status);
  });
});

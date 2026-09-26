import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  amountsEqual,
  formatReport,
  RECONCILIATION_INVARIANTS,
  reconcile,
  type FindingKind,
  type ReconciliationInput,
  type ReconciliationReport
} from "@/core/reconciliation/reconciliation";
import {
  RECONCILIATION_DRY_RUN_OP,
  registerReconciliation,
  reconciliationRunMachine
} from "@/core/reconciliation/job";
import { createWorkerFramework, type JobPayload } from "@/core/workers/queue";
import type { Notification } from "@/core/notifications/types";
import { setTelemetrySink, type TelemetryEvent } from "@/core/telemetry/telemetry";

const NOW = 1_770_000_000_000;

function snapshot(overrides: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    storedBalances: [],
    ledgerBalances: [],
    jobs: [],
    notifications: [],
    idempotencyRecords: [],
    exportEnvelopes: [],
    operations: [],
    now: NOW,
    ...overrides
  };
}

function job(overrides: Partial<JobPayload> = {}): JobPayload {
  return {
    id: "job-1",
    operation: "demo.run",
    params: {},
    maxAttempts: 3,
    attempts: 0,
    status: "queued",
    enqueuedAt: new Date(NOW).toISOString(),
    correlationId: "corr-1",
    ...overrides
  };
}

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notification-1",
    recipient: "workspace",
    event: "completed",
    tone: "success",
    title: "Done",
    message: "Finished",
    href: "/tools/operation-browser",
    dedupeKey: "k1",
    createdAt: new Date(NOW).toISOString(),
    state: "unread",
    read: false,
    ...overrides
  };
}

function kindsOf(findings: readonly { kind: FindingKind }[]): FindingKind[] {
  return [...new Set(findings.map((entry) => entry.kind))].sort();
}

describe("reconciliation dry run", () => {
  let events: TelemetryEvent[];

  beforeEach(() => {
    events = [];
    setTelemetrySink({ emit: (event) => events.push(event) });
  });

  it("reports a clean snapshot with every declared invariant checked", () => {
    const report = reconcile(snapshot());
    expect(report.dryRun).toBe(true);
    expect(report.clean).toBe(true);
    expect(report.summary).toEqual({ missing: 0, duplicate: 0, stale: 0, inconsistent: 0, total: 0 });
    expect(report.checks.map((check) => check.invariant).sort()).toEqual(
      RECONCILIATION_INVARIANTS.map((entry) => entry.id).sort()
    );
    expect(report.checks.every((check) => check.checked >= 0)).toBe(true);
  });

  // --- missing -------------------------------------------------------------

  it("finds a stored balance with no ledger entry (missing)", () => {
    const report = reconcile(
      snapshot({
        storedBalances: [{ account: "G1", asset: "USDC", balance: "10.5", cachedAt: "2026-09-26T00:00:00.000Z" }]
      })
    );

    expect(report.clean).toBe(true); // missing is informational
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      invariant: "balance.ledger_entry_present",
      kind: "missing",
      subject: "stored_balance",
      recordId: "G1|USDC",
      severity: "info"
    });
    expect(report.findings[0].repair).toContain("Re-read the account from Horizon");
  });

  // --- inconsistent --------------------------------------------------------

  it("finds a stored balance that disagrees with the ledger (inconsistent)", () => {
    const report = reconcile(
      snapshot({
        storedBalances: [{ account: "G1", asset: "USDC", balance: "10.50" }],
        ledgerBalances: [{ account: "G1", asset: "USDC", balance: "10.51", reference: "ledger:100" }]
      })
    );

    expect(report.clean).toBe(false);
    expect(report.findings[0]).toMatchObject({
      invariant: "balance.amount_agrees",
      kind: "inconsistent",
      expected: "10.51",
      observed: "10.50"
    });
    // A trailing zero is not drift.
    expect(
      reconcile(
        snapshot({
          storedBalances: [{ account: "G1", asset: "USDC", balance: "10.5" }],
          ledgerBalances: [{ account: "G1", asset: "USDC", balance: "10.50", reference: "l1" }]
        })
      ).summary.inconsistent
    ).toBe(0);
  });

  it("finds a job in an undeclared state and one past its budget (inconsistent)", () => {
    const report = reconcile(
      snapshot({
        jobs: [
          job({ id: "job-unknown", status: "failed" as JobPayload["status"] }),
          job({ id: "job-budget", status: "retrying", attempts: 3, maxAttempts: 3 })
        ]
      })
    );

    expect(kindsOf(report.findings)).toEqual(["inconsistent"]);
    expect(report.findings.map((entry) => entry.recordId).sort()).toEqual([
      "job-budget",
      "job-unknown"
    ]);
    expect(report.findings.every((entry) => entry.severity === "critical")).toBe(true);
  });

  it("finds an envelope whose recordCount does not match its records (inconsistent)", () => {
    const report = reconcile(
      snapshot({
        exportEnvelopes: [
          {
            schemaVersion: "1.0",
            scope: "own",
            generatedAt: "2026-09-26T00:00:00.000Z",
            expiresAt: "2026-09-27T00:00:00.000Z",
            generator: "utix-export@1",
            correlationId: "corr-env",
            recordCount: 3,
            page: 1,
            totalRecords: 3,
            nextCursor: null,
            hasMore: false,
            records: [{ op: "wallet.detect" }]
          }
        ]
      })
    );

    expect(report.findings[0]).toMatchObject({
      invariant: "export_envelope.count_matches",
      kind: "inconsistent",
      expected: "1",
      observed: "3"
    });
  });

  // --- duplicate -----------------------------------------------------------

  it("finds duplicate balance lines and duplicate pending dedupe keys (duplicate)", () => {
    const report = reconcile(
      snapshot({
        storedBalances: [
          { account: "G1", asset: "USDC", balance: "1" },
          { account: "G1", asset: "USDC", balance: "1" }
        ],
        // The second line disagrees with the ledger, which is its own finding;
        // this test is about the duplicate identity checks.
        ledgerBalances: [
          { account: "G1", asset: "USDC", balance: "1", reference: "l1" },
          { account: "G1", asset: "USDC", balance: "1", reference: "l1" }
        ],
        jobs: [
          job({ id: "job-a", dedupeKey: "daily" }),
          job({ id: "job-b", dedupeKey: "daily" })
        ]
      })
    );

    expect(kindsOf(report.findings)).toEqual(["duplicate"]);
    expect(report.findings.map((entry) => entry.invariant).sort()).toEqual([
      "balance.single_line_per_asset",
      "worker_job.dedupe_unique"
    ]);
    // A settled duplicate dedupe key is history, not drift.
    expect(
      reconcile(
        snapshot({
          jobs: [
            job({ id: "job-a", status: "succeeded", dedupeKey: "daily" }),
            job({ id: "job-b", status: "succeeded", dedupeKey: "daily" })
          ]
        })
      ).summary.duplicate
    ).toBe(0);
  });

  it("finds the same notification id stored twice (duplicate)", () => {
    const report = reconcile(
      snapshot({ notifications: [notification(), notification()] })
    );
    expect(report.findings[0]).toMatchObject({
      invariant: "notification.identity_unique",
      kind: "duplicate",
      subject: "notification"
    });
  });

  // --- stale ---------------------------------------------------------------

  it("finds a pending job past its deadline (stale)", () => {
    const report = reconcile(
      snapshot({
        jobs: [job({ id: "job-stale", enqueuedAt: new Date(NOW - 3_600_000).toISOString() })],
        staleAfterMs: 60_000
      })
    );

    expect(report.findings[0]).toMatchObject({
      invariant: "worker_job.progress",
      kind: "stale",
      severity: "warning"
    });
    expect(report.findings[0].repair).toContain("processJob");
  });

  it("finds an expired idempotency record and a claim that never settled (stale)", () => {
    const report = reconcile(
      snapshot({
        idempotencyRecords: [
          {
            key: "expired-key-01",
            operation: "export.generate",
            requestHash: "req-1",
            status: "completed",
            createdAt: new Date(NOW - 7_200_000).toISOString(),
            expiresAt: new Date(NOW - 3_600_000).toISOString(),
            replays: 0,
            correlationId: "corr-2"
          },
          {
            key: "inflight-key-01",
            operation: "worker.enqueue",
            requestHash: "req-2",
            status: "in_flight",
            createdAt: new Date(NOW - 3_600_000).toISOString(),
            expiresAt: new Date(NOW + 3_600_000).toISOString(),
            replays: 0,
            correlationId: "corr-3"
          }
        ],
        staleAfterMs: 60_000
      })
    );

    expect(report.findings.map((entry) => entry.recordId).sort()).toEqual([
      "expired-key-01",
      "inflight-key-01"
    ]);
    expect(kindsOf(report.findings)).toEqual(["stale"]);
  });

  it("finds an expired export envelope still marked generated (stale)", () => {
    const report = reconcile(
      snapshot({
        exportEnvelopes: [
          {
            schemaVersion: "1.0",
            scope: "own",
            generatedAt: new Date(NOW - 7_200_000).toISOString(),
            expiresAt: new Date(NOW - 3_600_000).toISOString(),
            generator: "utix-export@1",
            correlationId: "corr-env-2",
            recordCount: 0,
            page: 1,
            totalRecords: 0,
            nextCursor: null,
            hasMore: false,
            records: []
          }
        ]
      })
    );
    expect(report.findings[0]).toMatchObject({
      invariant: "export_envelope.retention",
      kind: "stale"
    });
  });

  it("finds an operation record that never reached a terminal state (stale)", () => {
    const report = reconcile(
      snapshot({
        operations: [
          {
            id: "op-1",
            op: "horizon.request",
            state: "started",
            startedAt: new Date(NOW - 600_000).toISOString(),
            correlationId: "corr-4"
          }
        ],
        staleAfterMs: 60_000
      })
    );
    expect(report.findings[0]).toMatchObject({ invariant: "operation.settles", kind: "stale" });
  });

  it("finds a notification in an undeclared state (inconsistent)", () => {
    const report = reconcile(
      snapshot({
        notifications: [notification({ state: "snoozed" as Notification["state"] })]
      })
    );
    expect(report.findings[0]).toMatchObject({
      invariant: "notification.state_declared",
      kind: "inconsistent"
    });
  });

  it("reports a secret-shaped identifier in a finding as redacted", () => {
    // A secret pasted into an address field must not reach a report or a sink.
    const report = reconcile(
      snapshot({
        storedBalances: [{ account: `S${"A".repeat(55)}`, asset: "USDC", balance: "1" }]
      })
    );
    expect(report.findings[0].recordId).toContain("[REDACTED]");
    expect(report.findings[0].id).toContain("[REDACTED]");
    // Nothing in the report, including the quoted detail, keeps the secret.
    expect(JSON.stringify(report)).not.toContain(`S${"A".repeat(55)}`);
  });

  // --- read-only guarantees ------------------------------------------------

  it("never mutates the snapshot it inspects", () => {
    const frozen = Object.freeze({
      ...snapshot({
        storedBalances: Object.freeze([{ account: "G1", asset: "USDC", balance: "1" }]),
        jobs: Object.freeze([job({ id: "job-budget", status: "retrying", attempts: 3, maxAttempts: 3 })])
      })
    }) as ReconciliationInput;

    const before = JSON.stringify(frozen);
    const report = reconcile(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(report.dryRun).toBe(true);
    // Deep-freeze proves it: any write attempt would throw in strict mode.
    expect(Object.isFrozen(frozen.storedBalances)).toBe(true);
  });

  it("renders a stable, quoted report for CI", () => {
    const report = reconcile(
      snapshot({ storedBalances: [{ account: "G1", asset: "USDC", balance: "1" }] })
    );
    const text = formatReport(report);
    expect(text).toContain("dry run");
    expect(text).toContain("missing=1");
    expect(text).toContain("balance.ledger_entry_present");
    expect(text).toContain("repair:");
    expect(formatReport(reconcile(snapshot()))).toContain("no drift detected");
  });

  it("compares amounts as decimal strings, never as floats", () => {
    expect(amountsEqual("0.1", "0.10")).toBe(true);
    expect(amountsEqual("1", "1.000")).toBe(true);
    expect(amountsEqual("-2.50", "-2.5")).toBe(true);
    expect(amountsEqual("0.1", "0.2")).toBe(false);
    expect(amountsEqual("1.005", "1.0049")).toBe(false);
    expect(amountsEqual("abc", "abc")).toBe(true);
  });
});

describe("reconciliation worker job", () => {
  beforeEach(() => {
    setTelemetrySink({ emit: () => undefined });
  });

  it("runs as a registered worker job and publishes the report", () => {
    const framework = createWorkerFramework();
    const last: { report?: ReconciliationReport } = {};
    const runNow = registerReconciliation({
      framework,
      providers: {
        read: () =>
          snapshot({ storedBalances: [{ account: "G1", asset: "USDC", balance: "1" }] })
      },
      last
    });

    const job = framework.enqueue({ operation: RECONCILIATION_DRY_RUN_OP });
    const summary = framework.drainDueJobs();
    expect(summary.succeeded).toBe(1);
    expect(job.status).toBe("succeeded");

    const direct = runNow();
    expect(direct.ok).toBe(true);
    if (direct.ok) {
      expect(direct.value.report.summary.missing).toBe(1);
      expect(direct.value.summary).toContain("balance.ledger_entry_present");
    }
  });

  it("emits one structured telemetry record per run", () => {
    const events: TelemetryEvent[] = [];
    setTelemetrySink({ emit: (event) => events.push(event) });
    const framework = createWorkerFramework();
    const runNow = registerReconciliation({ framework, providers: { read: () => snapshot() } });

    runNow();
    const record = events.find((event) => event.op === "reconciliation.dry_run");
    expect(record).toMatchObject({ actorType: "worker", result: "success" });
    expect(record?.payload).toMatchObject({ findings: 0, invariants: RECONCILIATION_INVARIANTS.length });
  });

  it("fails loudly when a snapshot cannot be read, and never a partial report", () => {
    const framework = createWorkerFramework();
    const runNow = registerReconciliation({
      framework,
      providers: {
        read: () => {
          throw new Error("store unavailable");
        }
      }
    });

    expect(runNow()).toEqual({ ok: false, code: "snapshot_unavailable" });

    const job = framework.enqueue({ operation: RECONCILIATION_DRY_RUN_OP, maxAttempts: 1 });
    framework.drainDueJobs();
    expect(job.status).toBe("dead_lettered");
    expect(job.lastError?.code).toBe("snapshot_unavailable");
  });

  it("declares a run lifecycle with a terminal reported state", () => {
    expect(reconciliationRunMachine.initial()).toBe("pending");
    expect(reconciliationRunMachine.canTransition("pending", "collect").ok).toBe(true);
    expect(reconciliationRunMachine.isTerminal("reported")).toBe(true);
    expect(reconciliationRunMachine.canTransition("reported", "analyze")).toMatchObject({
      ok: false,
      code: "terminal_state"
    });
  });

  it("reads the snapshot exactly once per run", () => {
    const read = vi.fn(() => snapshot());
    const framework = createWorkerFramework();
    const runNow = registerReconciliation({ framework, providers: { read } });
    runNow();
    expect(read).toHaveBeenCalledTimes(1);
  });
});

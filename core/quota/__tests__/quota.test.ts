import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryQuotaStorage,
  createQuotaStore,
  describeQuotaError,
  isQuotaDenial,
  QUOTA_GLOBAL_SUBJECT,
  QUOTA_MAX_OVERRIDE_TTL_MS,
  QUOTA_POLICIES,
  withQuota,
  type QuotaPolicy,
  type QuotaStore
} from "@/core/quota/quota";
import { getAuditTrail } from "@/core/audit/audit";
import {
  createExportIdempotencyStore,
  createExportQuotaStore,
  EXPORT_CURRENT_SCHEMA_VERSION,
  exportRecords,
  type ExportRecordSource
} from "@/core/export/exporter";
import { createWorkerFramework } from "@/core/workers/queue";
import { err, ok } from "@/core/result/result";
import { setTelemetrySink, type TelemetryEvent } from "@/core/telemetry/telemetry";

const START = Date.parse("2026-09-26T00:00:00.000Z");
const HOUR = 60 * 60 * 1_000;
const MAINTAINER = { kind: "maintainer", id: "ada" } as const;

const TEST_POLICY: QuotaPolicy = {
  operation: "ticket.issue",
  resource: "storage",
  limit: 3,
  globalLimit: 5,
  windowMs: HOUR,
  maxOverrideLimit: 10,
  rationale: "test"
};

function fixedStore(policies: readonly QuotaPolicy[] = [TEST_POLICY]): {
  store: QuotaStore;
  at: (ms: number) => void;
} {
  let clock = START;
  const store = createQuotaStore({ policies, now: () => clock, storage: createMemoryQuotaStorage() });
  return { store, at: (ms: number) => (clock = ms) };
}

const issue = (principal: string, cost?: number) => ({ operation: "ticket.issue", principal, cost });

describe("quota policy catalog", () => {
  it("declares every resource class the issue scopes", () => {
    const resources = new Set(QUOTA_POLICIES.map((policy) => policy.resource));
    expect(resources).toEqual(new Set(["storage", "compute", "external_api", "indexing"]));
  });

  it("meters ticket issuance, transfer, redemption, event operations and fraud screening", () => {
    const operations = QUOTA_POLICIES.map((policy) => policy.operation);
    for (const operation of ["ticket.issue", "ticket.transfer", "ticket.redeem", "event.create", "event.update", "fraud.screen"]) {
      expect(operations).toContain(operation);
    }
  });

  it("builds a store from the shipped catalog without throwing", () => {
    expect(() => createQuotaStore({ storage: createMemoryQuotaStorage() })).not.toThrow();
  });

  it("rejects a malformed catalog at construction", () => {
    expect(() => createQuotaStore({ policies: [TEST_POLICY, TEST_POLICY] })).toThrow(/duplicate/);
    expect(() => createQuotaStore({ policies: [{ ...TEST_POLICY, limit: 0 }] })).toThrow(/positive/);
    expect(() => createQuotaStore({ policies: [{ ...TEST_POLICY, globalLimit: 1 }] })).toThrow(/globalLimit/);
  });
});

describe("quota store", () => {
  let events: TelemetryEvent[];

  beforeEach(() => {
    events = [];
    setTelemetrySink({ emit: (event) => events.push(event) });
    getAuditTrail().reset();
  });

  it("spends against a principal until the limit, then refuses", () => {
    const { store } = fixedStore();
    expect(store.consume(issue("organizer:a")).ok).toBe(true);
    expect(store.consume(issue("organizer:a", 2)).ok).toBe(true);
    const refused = store.consume(issue("organizer:a"));
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe("quota_exceeded");
    expect(refused.detail).toMatchObject({ operation: "ticket.issue", limitScope: "principal", retryAfterMs: HOUR });
  });

  it("refuses a batch that would overshoot instead of spending part of it", () => {
    const { store } = fixedStore();
    store.consume(issue("organizer:a", 2));
    expect(store.consume(issue("organizer:a", 2)).ok).toBe(false);
    expect(store.remaining("ticket.issue", "organizer:a")).toMatchObject({ ok: true, value: { remaining: 1 } });
  });

  it("caps every principal together with the global limit", () => {
    const { store } = fixedStore();
    store.consume(issue("organizer:a", 3));
    store.consume(issue("organizer:b", 2));
    const refused = store.consume(issue("organizer:c"));
    expect(refused).toMatchObject({ ok: false, code: "quota_exceeded", detail: { limitScope: "global" } });
  });

  it("resets when the window rolls over", () => {
    const { store, at } = fixedStore();
    store.consume(issue("organizer:a", 3));
    expect(store.consume(issue("organizer:a")).ok).toBe(false);
    at(START + HOUR);
    expect(store.consume(issue("organizer:a")).ok).toBe(true);
  });

  it("check() answers without spending", () => {
    const { store } = fixedStore();
    expect(store.check(issue("organizer:a", 3)).ok).toBe(true);
    expect(store.check(issue("organizer:a", 3)).ok).toBe(true);
    expect(store.check(issue("organizer:a", 4)).ok).toBe(false);
  });

  it("refuses undeclared operations, bad principals and bad costs", () => {
    const { store } = fixedStore();
    expect(store.consume({ operation: "ticket.mint_unlimited", principal: "a" })).toMatchObject({ code: "quota_unknown_operation" });
    expect(store.consume(issue(""))).toMatchObject({ code: "quota_invalid_principal" });
    expect(store.consume(issue(QUOTA_GLOBAL_SUBJECT))).toMatchObject({ code: "quota_invalid_principal" });
    expect(store.consume(issue("organizer:a", 0))).toMatchObject({ code: "quota_invalid_cost" });
    expect(store.consume(issue("organizer:a", 1.5))).toMatchObject({ code: "quota_invalid_cost" });
  });

  it("refunds a receipt once, and never across a window", () => {
    const { store, at } = fixedStore();
    const receipt = store.consume(issue("organizer:a", 3));
    if (!receipt.ok) throw new Error("expected a receipt");
    store.refund(receipt.value);
    store.refund(receipt.value);
    expect(store.remaining("ticket.issue", "organizer:a")).toMatchObject({ value: { remaining: 3 } });

    const second = store.consume(issue("organizer:a", 2));
    if (!second.ok) throw new Error("expected a receipt");
    at(START + HOUR);
    store.consume(issue("organizer:a", 1));
    store.refund(second.value);
    expect(store.remaining("ticket.issue", "organizer:a")).toMatchObject({ value: { remaining: 2 } });
  });

  it("persists counters through the storage adapter", () => {
    const storage = createMemoryQuotaStorage();
    const first = createQuotaStore({ policies: [TEST_POLICY], now: () => START, storage });
    first.consume(issue("organizer:a", 3));
    const reloaded = createQuotaStore({ policies: [TEST_POLICY], now: () => START, storage });
    expect(reloaded.consume(issue("organizer:a")).ok).toBe(false);
  });

  it("emits telemetry for spends and denials without the principal id", () => {
    const { store } = fixedStore();
    store.consume(issue("account:GABC", 3));
    store.consume(issue("account:GABC"));
    const quotaEvents = events.filter((event) => event.op === "quota.consume");
    expect(quotaEvents.map((event) => event.result)).toEqual(["success", "failure"]);
    expect(quotaEvents[1].errorCode).toBe("quota_exceeded");
    expect(JSON.stringify(quotaEvents)).not.toContain("account:GABC");
  });
});

describe("quota overrides", () => {
  beforeEach(() => {
    setTelemetrySink({ emit: () => undefined });
    getAuditTrail().reset();
  });

  it("lets a maintainer raise a principal's limit, audited", () => {
    const { store } = fixedStore();
    const granted = store.grantOverride(MAINTAINER, {
      operation: "ticket.issue",
      subject: "organizer:a",
      limit: 5,
      reason: "event.onsale_peak",
      ttlMs: HOUR
    });
    expect(granted.ok).toBe(true);
    expect(store.consume(issue("organizer:a", 5)).ok).toBe(true);

    const trail = getAuditTrail().query(MAINTAINER, { action: "quota.override_granted" });
    expect(trail.ok && trail.value.events[0]).toMatchObject({
      outcome: "allowed",
      reason: "event.onsale_peak",
      target: { kind: "quota_override", id: "ticket.issue|organizer:a" },
      after: { limit: 5, policyLimit: 3 }
    });
  });

  it("blocks a principal with a zero limit and promises no retry time", () => {
    const { store } = fixedStore();
    store.grantOverride(MAINTAINER, { operation: "ticket.issue", subject: "organizer:x", limit: 0, reason: "fraud.block", ttlMs: HOUR });
    const refused = store.consume(issue("organizer:x"));
    expect(refused).toMatchObject({ ok: false, code: "quota_exceeded", detail: { retryAfterMs: null } });
  });

  it("can raise the shared global limit", () => {
    const { store } = fixedStore();
    store.grantOverride(MAINTAINER, { operation: "ticket.issue", subject: QUOTA_GLOBAL_SUBJECT, limit: 10, reason: "event.onsale_peak", ttlMs: HOUR });
    store.consume(issue("organizer:a", 3));
    store.consume(issue("organizer:b", 3));
    expect(store.consume(issue("organizer:c", 3)).ok).toBe(true);
  });

  it("expires on its own", () => {
    const { store, at } = fixedStore();
    store.grantOverride(MAINTAINER, { operation: "ticket.issue", subject: "organizer:a", limit: 0, reason: "fraud.block", ttlMs: 10 * 60 * 1_000 });
    expect(store.consume(issue("organizer:a")).ok).toBe(false);
    at(START + 10 * 60 * 1_000);
    expect(store.consume(issue("organizer:a")).ok).toBe(true);
  });

  it("refuses a non-maintainer and audits the refusal", () => {
    const { store } = fixedStore();
    const denied = store.grantOverride({ kind: "user", id: "account:GABC" }, {
      operation: "ticket.issue",
      subject: "account:GABC",
      limit: 10,
      reason: "self.service",
      ttlMs: HOUR
    });
    expect(denied).toMatchObject({ ok: false, code: "quota_override_denied" });
    const trail = getAuditTrail().query(MAINTAINER, { action: "quota.override_granted", outcome: "denied" });
    expect(trail.ok && trail.value.total).toBe(1);
  });

  it("refuses overrides above the ceiling, without expiry bounds, or with a free-form reason", () => {
    const { store } = fixedStore();
    const base = { operation: "ticket.issue", subject: "organizer:a", limit: 5, reason: "event.onsale_peak", ttlMs: HOUR };
    expect(store.grantOverride(MAINTAINER, { ...base, limit: 11 })).toMatchObject({ code: "quota_override_invalid" });
    expect(store.grantOverride(MAINTAINER, { ...base, limit: -1 })).toMatchObject({ code: "quota_override_invalid" });
    expect(store.grantOverride(MAINTAINER, { ...base, ttlMs: QUOTA_MAX_OVERRIDE_TTL_MS + 1 })).toMatchObject({ code: "quota_override_invalid" });
    expect(store.grantOverride(MAINTAINER, { ...base, ttlMs: 0 })).toMatchObject({ code: "quota_override_invalid" });
    expect(store.grantOverride(MAINTAINER, { ...base, reason: "Because I said so" })).toMatchObject({ code: "quota_override_invalid" });
    expect(store.grantOverride(MAINTAINER, { ...base, operation: "nope" })).toMatchObject({ code: "quota_unknown_operation" });
  });

  it("revokes an override and audits it", () => {
    const { store } = fixedStore();
    store.grantOverride(MAINTAINER, { operation: "ticket.issue", subject: "organizer:a", limit: 0, reason: "fraud.block", ttlMs: HOUR });
    expect(store.revokeOverride(MAINTAINER, "ticket.issue", "organizer:a", "fraud.cleared").ok).toBe(true);
    expect(store.consume(issue("organizer:a")).ok).toBe(true);
    expect(store.revokeOverride(MAINTAINER, "ticket.issue", "organizer:a", "fraud.cleared")).toMatchObject({ code: "quota_override_not_found" });
    const trail = getAuditTrail().query(MAINTAINER, { action: "quota.override_revoked" });
    expect(trail.ok && trail.value.total).toBe(1);
  });
});

describe("quota diagnostics and user-safe errors", () => {
  beforeEach(() => setTelemetrySink({ emit: () => undefined }));

  it("gives maintainers usage, overrides and recent denials", () => {
    const { store } = fixedStore();
    store.grantOverride(MAINTAINER, { operation: "ticket.issue", subject: "organizer:b", limit: 1, reason: "fraud.throttle", ttlMs: HOUR });
    store.consume(issue("organizer:a", 2));
    store.consume(issue("organizer:b"));
    store.consume({ ...issue("organizer:b"), correlationId: "corr-denied" });

    const diagnostics = store.diagnose(MAINTAINER);
    if (!diagnostics.ok) throw new Error("expected diagnostics");
    const { usage, overrides, recentDenials } = diagnostics.value;
    expect(usage.find((entry) => entry.subject === QUOTA_GLOBAL_SUBJECT)).toMatchObject({ used: 3, limit: 5 });
    expect(usage.find((entry) => entry.subject === "organizer:b")).toMatchObject({
      used: 1,
      limit: 1,
      policyLimit: 3,
      overridden: true,
      denied: 1
    });
    expect(overrides).toHaveLength(1);
    expect(recentDenials).toEqual([
      expect.objectContaining({ principal: "organizer:b", correlationId: "corr-denied", used: 1, limit: 1 })
    ]);
  });

  it("refuses diagnostics to anyone but a maintainer", () => {
    const { store } = fixedStore();
    expect(store.diagnose({ kind: "user", id: "account:GABC" })).toMatchObject({ code: "quota_diagnostics_denied" });
    expect(store.diagnose({ kind: "system" })).toMatchObject({ code: "quota_diagnostics_denied" });
  });

  it("describes a principal denial with a wait, and no internal numbers", () => {
    const { store } = fixedStore();
    store.consume(issue("organizer:a", 3));
    const refused = store.consume({ ...issue("organizer:a"), correlationId: "corr-1" });
    if (refused.ok) throw new Error("expected a denial");
    expect(isQuotaDenial(refused.detail)).toBe(true);
    const message = describeQuotaError(refused.code, refused.detail);
    expect(message).toMatchObject({ title: "Limit reached", retryAfterSeconds: 3_600 });
    expect(message.message).toContain("1 hour");
    expect(message.message).toContain("corr-1");
    expect(message.message).not.toMatch(/\b3\b|\b5\b|organizer/);
  });

  it("describes a global denial as busy, and a block as unavailable", () => {
    expect(
      describeQuotaError("quota_exceeded", {
        operation: "fraud.screen",
        resource: "external_api",
        limitScope: "global",
        retryAfterMs: 90_000,
        correlationId: "c"
      })
    ).toMatchObject({ title: "Busy right now", retryAfterSeconds: 90 });
    expect(
      describeQuotaError("quota_exceeded", {
        operation: "ticket.transfer",
        resource: "storage",
        limitScope: "principal",
        retryAfterMs: null,
        correlationId: "c"
      })
    ).toMatchObject({ title: "Action unavailable", retryAfterSeconds: null });
    expect(describeQuotaError("quota_unknown_operation").retryAfterSeconds).toBeNull();
  });
});

describe("withQuota", () => {
  beforeEach(() => setTelemetrySink({ emit: () => undefined }));

  it("does not run the work when the quota is spent", async () => {
    const { store } = fixedStore();
    store.consume(issue("organizer:a", 3));
    const run = vi.fn(() => ok("ticket-1"));
    const outcome = await withQuota(store, { ...issue("organizer:a"), run });
    expect(outcome).toMatchObject({ ok: false, code: "quota_exceeded" });
    expect(run).not.toHaveBeenCalled();
  });

  it("refunds only the failures that never started the work", async () => {
    const { store } = fixedStore();
    await withQuota(store, { ...issue("organizer:a"), run: () => err("seat_invalid"), refundOn: ["seat_invalid"] });
    expect(store.remaining("ticket.issue", "organizer:a")).toMatchObject({ value: { remaining: 3 } });
    await withQuota(store, { ...issue("organizer:a"), run: () => err("chain_timeout"), refundOn: ["seat_invalid"] });
    expect(store.remaining("ticket.issue", "organizer:a")).toMatchObject({ value: { remaining: 2 } });
  });
});

describe("quota integration", () => {
  const source: ExportRecordSource = {
    recordType: "operation_log",
    schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION,
    scope: "own",
    collect: () => [{ op: "wallet.detect", result: "success" }]
  };

  beforeEach(() => {
    setTelemetrySink({ emit: () => undefined });
    getAuditTrail().reset();
    createExportIdempotencyStore();
  });

  it("charges export generation per principal, and not for a replay", () => {
    const quota = createExportQuotaStore(
      createQuotaStore({
        policies: [{ operation: "export.generate", resource: "compute", limit: 1, windowMs: HOUR, rationale: "test" }],
        storage: createMemoryQuotaStorage()
      })
    );
    const request = {
      schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION,
      scope: "own" as const,
      actor: { kind: "user" as const },
      principal: "account:GABC",
      idempotencyKey: "export:quota:0001"
    };
    expect(exportRecords(request, [source]).ok).toBe(true);
    expect(exportRecords(request, [source]).ok).toBe(true);
    const refused = exportRecords({ ...request, idempotencyKey: "export:quota:0002" }, [source]);
    expect(refused).toMatchObject({ ok: false, code: "quota_exceeded" });
    expect(exportRecords({ ...request, principal: "account:GXYZ", idempotencyKey: "export:quota:0003" }, [source]).ok).toBe(true);
    expect(quota.remaining("export.generate", "account:GABC")).toMatchObject({ value: { remaining: 0 } });
    createExportQuotaStore();
  });

  it("charges worker submissions and releases the idempotency claim on denial", () => {
    const quota = createQuotaStore({
      policies: [{ operation: "worker.enqueue", resource: "compute", limit: 1, windowMs: HOUR, rationale: "test" }],
      storage: createMemoryQuotaStorage()
    });
    const framework = createWorkerFramework({}, { quota });
    framework.register("ticket.reissue", () => undefined);
    expect(framework.submit({ operation: "ticket.reissue", idempotencyKey: "job:quota:0001", principal: "organizer:a" }).ok).toBe(true);
    const refused = framework.submit({ operation: "ticket.reissue", idempotencyKey: "job:quota:0002", principal: "organizer:a" });
    expect(refused).toMatchObject({ ok: false, code: "quota_exceeded" });
    expect(framework.inspect()).toHaveLength(1);
    expect(framework.idempotency().lookup("job:quota:0002").ok).toBe(false);
  });
});

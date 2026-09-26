import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalize,
  createIdempotencyStore,
  IDEMPOTENCY_STORAGE_PREFIX,
  isValidIdempotencyKey,
  requestDigest,
  withIdempotency,
  type IdempotencyStore
} from "@/core/idempotency/idempotency";
import { createWorkerFramework, type WorkerFramework } from "@/core/workers/queue";
import {
  createExportIdempotencyStore,
  EXPORT_CURRENT_SCHEMA_VERSION,
  exportRecords,
  type ExportRecordSource
} from "@/core/export/exporter";
import { setTelemetrySink, type TelemetryEvent } from "@/core/telemetry/telemetry";
import { ok, err } from "@/core/result/result";

/** A store with an injected clock, so expiry is testable without waiting. */
function fixedStore(ttlMs = 60_000): { store: IdempotencyStore; at: (ms: number) => void } {
  let clock = 1_700_000_000_000;
  let counter = 0;
  const store = createIdempotencyStore({
    ttlMs,
    now: () => clock,
    newId: () => `id-${(counter += 1)}`
  });
  return { store, at: (ms: number) => (clock = ms) };
}

const source: ExportRecordSource = {
  recordType: "operation_log",
  schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION,
  scope: "own",
  collect: () => [{ op: "wallet.detect", result: "success" }]
};

describe("idempotency store", () => {
  let events: TelemetryEvent[];

  beforeEach(() => {
    events = [];
    setTelemetrySink({ emit: (event) => events.push(event) });
  });

  it("replays a recorded outcome instead of running the work twice", async () => {
    const { store } = fixedStore();
    const run = vi.fn(() => ok({ jobId: "job-1" }));

    const first = await withIdempotency(store, {
      key: "export:2026-09-26:1",
      operation: "export.generate",
      request: { page: 1 },
      run
    });
    const second = await withIdempotency(store, {
      key: "export:2026-09-26:1",
      operation: "export.generate",
      request: { page: 1 },
      run
    });

    expect(first.ok && first.value.replayed).toBe(false);
    expect(second.ok && second.value.replayed).toBe(true);
    // The identical value, not a freshly generated one.
    expect(second.ok && second.value.value).toEqual(first.ok && first.value.value);
    expect(run).toHaveBeenCalledTimes(1);
    expect(events.filter((event) => event.op === "idempotency.replayed")).toHaveLength(1);
  });

  it("replays a recorded failure after a retry instead of re-running it", async () => {
    const { store } = fixedStore();
    const run = vi.fn(() => err("horizon_timeout"));

    const first = await withIdempotency(store, { key: "retry-key-01", operation: "worker.run", run });
    const second = await withIdempotency(store, {
      key: "retry-key-01",
      operation: "worker.run",
      run
    });

    expect(first).toEqual({ ok: false, code: "horizon_timeout" });
    expect(second).toEqual({ ok: false, code: "horizon_timeout" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.list()[0]).toMatchObject({ status: "failed", errorCode: "horizon_timeout" });
  });

  it("records a thrown error as a failed attempt and keeps the outcome replayable", async () => {
    const { store } = fixedStore();
    const run = vi.fn(() => {
      throw new Error("boom");
    });

    const first = await withIdempotency(store, { key: "throw-key-01", operation: "worker.run", run });
    const second = await withIdempotency(store, { key: "throw-key-01", operation: "worker.run", run });

    expect(first).toEqual({ ok: false, code: "Error" });
    expect(second).toEqual({ ok: false, code: "Error" });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rejects a key that was reused for a different request", () => {
    const { store } = fixedStore();
    store.begin({ key: "conflict-key-1", operation: "export.generate", request: { page: 1 } });
    store.complete("conflict-key-1", { records: [] });

    expect(
      store.begin({ key: "conflict-key-1", operation: "export.generate", request: { page: 2 } })
    ).toEqual({ ok: false, code: "idempotency_key_conflict" });
    // Key order in the request must not matter.
    store.begin({ key: "conflict-key-2", operation: "export.generate", request: { a: 1, b: 2 } });
    store.complete("conflict-key-2", { records: [] });
    expect(
      store.begin({ key: "conflict-key-2", operation: "export.generate", request: { b: 2, a: 1 } })
    ).toMatchObject({ ok: true, value: { replay: true } });
    // A different operation on the same key is a collision too.
    expect(
      store.begin({ key: "conflict-key-2", operation: "worker.enqueue", request: { a: 1, b: 2 } })
    ).toEqual({ ok: false, code: "idempotency_key_conflict" });
  });

  it("rejects an expired key instead of silently running the work again", () => {
    const { store, at } = fixedStore(1_000);
    store.begin({ key: "expiry-key-001", operation: "export.generate", request: { page: 1 } });
    store.complete("expiry-key-001", { records: [] });

    at(1_700_000_002_000);

    // A late attempt reports the expiry instead of re-running the work…
    expect(
      store.begin({ key: "expiry-key-001", operation: "export.generate", request: { page: 1 } })
    ).toEqual({ ok: false, code: "idempotency_key_expired" });
    // …and the stale record is gone, so a lookup reports it as unknown.
    expect(store.lookup("expiry-key-001")).toEqual({ ok: false, code: "idempotency_not_found" });
    // A fresh key is accepted for the new attempt.
    expect(
      store.begin({ key: "expiry-key-002", operation: "export.generate", request: { page: 1 } }).ok
    ).toBe(true);
    expect(store.sweep()).toBe(0);
  });

  it("refuses a second claim while the first attempt is still in flight", () => {
    const { store } = fixedStore();
    expect(store.begin({ key: "inflight-key-01", operation: "worker.enqueue" }).ok).toBe(true);
    expect(store.begin({ key: "inflight-key-01", operation: "worker.enqueue" })).toEqual({
      ok: false,
      code: "idempotency_in_flight"
    });
    // Completing twice is refused too, and abandoning releases the claim.
    store.complete("inflight-key-01", { jobId: "j1" });
    expect(store.complete("inflight-key-01", { jobId: "j2" })).toEqual({
      ok: false,
      code: "idempotency_in_flight"
    });
    expect(store.abandon("inflight-key-01")).toEqual({ ok: false, code: "idempotency_in_flight" });
  });

  it("rejects missing and malformed keys with distinct codes", () => {
    const { store } = fixedStore();
    expect(store.begin({ key: undefined, operation: "worker.enqueue" })).toEqual({
      ok: false,
      code: "idempotency_key_missing"
    });
    expect(store.begin({ key: "short", operation: "worker.enqueue" })).toEqual({
      ok: false,
      code: "idempotency_key_invalid"
    });
    expect(store.begin({ key: "has spaces in it", operation: "worker.enqueue" })).toEqual({
      ok: false,
      code: "idempotency_key_invalid"
    });
    expect(isValidIdempotencyKey("export:2026-09-26:1")).toBe(true);
  });

  it("sweeps expired records and forgets an abandoned claim", () => {
    const { store, at } = fixedStore(500);
    store.begin({ key: "sweep-key-0001", operation: "worker.enqueue" });
    store.complete("sweep-key-0001", { jobId: "j1" });
    store.begin({ key: "sweep-key-0002", operation: "worker.enqueue" });
    store.abandon("sweep-key-0002");

    expect(store.list()).toHaveLength(1);
    expect(store.sweep(1_700_000_000_400)).toBe(0);
    at(1_700_000_001_000);
    expect(store.sweep()).toBe(1);
    expect(store.list()).toEqual([]);
    expect(store.lookup("sweep-key-0001")).toEqual({ ok: false, code: "idempotency_not_found" });
  });

  it("persists outcomes through the storage adapter and redacts them", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key)
    };
    const store = createIdempotencyStore({ storage });
    store.begin({ key: "storage-key-01", operation: "wallet.connect" });
    store.complete("storage-key-01", { authorizationToken: "S" + "A".repeat(55) });

    const raw = values.get(`${IDEMPOTENCY_STORAGE_PREFIX}storage-key-01`)!;
    expect(raw).toContain("REDACTED");
    expect(raw).not.toContain("S" + "A".repeat(55));

    // A second store over the same storage replays the persisted outcome.
    const reopened = createIdempotencyStore({ storage });
    const replayed = reopened.begin({
      key: "storage-key-01",
      operation: "wallet.connect"
    });
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(replayed.value.replay).toBe(true);
  });

  it("digests a request independently of key order", () => {
    expect(canonicalize({ b: 2, a: [1, { d: 4, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":4}],"b":2}');
    expect(requestDigest({ a: 1, b: 2 })).toBe(requestDigest({ b: 2, a: 1 }));
    expect(requestDigest({ a: 1 })).not.toBe(requestDigest({ a: 2 }));
  });
});

describe("idempotent write paths", () => {
  beforeEach(() => {
    setTelemetrySink({ emit: () => undefined });
  });

  it("submit() enqueues once for a retried worker request", () => {
    const framework: WorkerFramework = createWorkerFramework();
    framework.register("notify.send", vi.fn());
    const key = "worker-enqueue-01";

    const first = framework.submit({ operation: "notify.send", idempotencyKey: key });
    const second = framework.submit({ operation: "notify.send", idempotencyKey: key });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.replayed).toBe(false);
    expect(second.value.replayed).toBe(true);
    expect(second.value.job.id).toBe(first.value.job.id);
    expect(framework.inspect()).toHaveLength(1);
  });

  it("submit() reports a collision instead of queueing a second job", () => {
    const framework = createWorkerFramework();
    framework.register("notify.send", vi.fn());

    framework.submit({ operation: "notify.send", idempotencyKey: "worker-collide-01" });
    expect(
      framework.submit({ operation: "other.op", idempotencyKey: "worker-collide-01" })
    ).toEqual({ ok: false, code: "idempotency_key_conflict" });
    expect(
      framework.submit({ operation: "notify.send", idempotencyKey: "nope" })
    ).toEqual({ ok: false, code: "idempotency_key_invalid" });
    expect(framework.inspect()).toHaveLength(1);
  });

  it("regenerating an export with the same key returns the same artifact", () => {
    const store = createExportIdempotencyStore();
    const request = {
      schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION,
      scope: "own" as const,
      actor: { kind: "user" as const },
      idempotencyKey: "export-request-01"
    };

    const first = exportRecords(request, [source]);
    const second = exportRecords(request, [source]);

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(second.ok && second.value).toEqual(first.value);
    // One recorded outcome, replayed once.
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({ status: "completed", replays: 1 });
  });

  it("a denied export is recorded, so a retry replays the denial", () => {
    const store = createExportIdempotencyStore();
    const request = {
      schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION,
      scope: "maintainer" as const,
      actor: { kind: "user" as const },
      idempotencyKey: "export-request-02"
    };

    expect(exportRecords(request, [source])).toEqual({ ok: false, code: "export_denied" });
    expect(exportRecords(request, [source])).toEqual({ ok: false, code: "export_denied" });
    expect(store.list()[0]).toMatchObject({ status: "failed", errorCode: "export_denied" });
  });
});

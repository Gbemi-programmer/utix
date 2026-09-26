import { beforeEach, describe, expect, it } from "vitest";
import {
  AUDIT_DEFAULT_LIMIT,
  auditContext,
  authorizeAuditRead,
  createIsolatedAuditTrail,
  getAuditTrail,
  isAuditedLifecycleEvent,
  recordAudit,
  SENSITIVE_ACTIONS,
  type AuditEvent,
  type AuditInput
} from "@/core/audit/audit";
import { createWorkerFramework } from "@/core/workers/queue";
import { NotificationStore } from "@/core/notifications/store";
import {
  EXPORT_CURRENT_SCHEMA_VERSION,
  exportRecords,
  type ExportRecordSource
} from "@/core/export/exporter";
import { createIdempotencyStore } from "@/core/idempotency/idempotency";
import { applyTransition } from "@/core/lifecycle/lifecycle";
import { workerJobMachine } from "@/core/lifecycle/records";
import { setTelemetrySink } from "@/core/telemetry/telemetry";

const AT = "2026-09-26T00:00:00.000Z";

/** The app-wide trail is a singleton; every test starts from an empty one. */
function resetTrail(): void {
  getAuditTrail().reset();
  setTelemetrySink({ emit: () => undefined });
}

function record(overrides: Partial<AuditInput> = {}): AuditEvent | undefined {
  return recordAudit({
    action: "record.state_changed",
    actor: { kind: "maintainer", id: "ada" },
    scope: "maintainer",
    target: { kind: "worker_job", id: "job-1" },
    reason: "manual_dead_letter",
    before: { state: "retrying" },
    after: { state: "dead_lettered", event: "dead_letter" },
    at: AT,
    ...overrides
  });
}

function source(): ExportRecordSource {
  return {
    recordType: "operation_log",
    schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION,
    scope: "own",
    collect: () => [{ op: "wallet.detect", result: "success" }]
  };
}

describe("audit trail", () => {
  beforeEach(resetTrail);

  it("writes one structured event per sensitive action, with attribution", () => {
    const event = record()!;
    expect(event).toMatchObject({
      action: "record.state_changed",
      actor: { kind: "maintainer", id: "ada" },
      actorId: "ada",
      scope: "maintainer",
      target: { kind: "worker_job", id: "job-1" },
      reason: "manual_dead_letter",
      outcome: "allowed",
      before: { state: "retrying" },
      at: AT
    });
    expect(typeof event.id).toBe("string");
    expect(event.correlationId.length).toBeGreaterThan(0);
    expect(getAuditTrail().all()).toHaveLength(1);
  });

  it("rejects an unknown action, a malformed target and a free-text reason", () => {
    expect(record({ action: "nope" as AuditInput["action"] })).toBeUndefined();
    expect(record({ target: { kind: "", id: "x" } })).toBeUndefined();
    // A reason is a stable token, not a sentence: no payload can hide in it.
    expect(record({ reason: "because the operator said so at length" })).toBeUndefined();
    expect(getAuditTrail().all()).toHaveLength(0);
  });

  it("keeps secrets and whole payloads out of before/after", () => {
    const secret = `S${"A".repeat(55)}`;
    const event = record({
      before: {
        state: "queued",
        authorizationToken: secret,
        nested: { deep: secret },
        handler: () => undefined,
        count: 3,
        ok: true,
        missing: null
      }
    })!;

    expect(event.before).toEqual({ state: "queued", authorizationToken: "[REDACTED]", count: 3, ok: true, missing: null });
    expect(event.before).not.toHaveProperty("nested");
    expect(event.before).not.toHaveProperty("handler");
    expect(JSON.stringify(event)).not.toContain(secret);
  });

  it("caps context keys and value length", () => {
    const many = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [`key${index}`, `value-${index}`])
    );
    const context = auditContext(many)!;
    expect(Object.keys(context).length).toBeLessThanOrEqual(12);
    expect(auditContext({ long: "x".repeat(500) })!.long).toHaveLength(160);
    expect(auditContext(undefined)).toBeUndefined();
    expect(auditContext({ only: { nested: 1 } })).toBeUndefined();
  });

  it("is append-only: recording never rewrites an earlier event", () => {
    const first = record({ target: { kind: "worker_job", id: "job-1" } })!;
    const second = record({ target: { kind: "worker_job", id: "job-2" }, reason: "manual_retry" })!;
    const all = getAuditTrail().all();

    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(first);
    expect(all[1].id).toBe(second.id);
    expect(all.map((entry) => entry.at)).toEqual([AT, AT]);
  });

  it("prunes to the retention limit, dropping the oldest events", () => {
    const trail = createIsolatedAuditTrail({ limit: 2, now: () => Date.parse(AT) });
    for (const id of ["a", "b", "c"]) {
      trail.record({
        action: "record.state_changed",
        actor: { kind: "maintainer", id: "ada" },
        target: { kind: "worker_job", id },
        at: AT
      });
    }
    expect(trail.all()).toHaveLength(3);
    expect(trail.prune()).toBe(1);
    expect(trail.all().map((entry) => entry.target.id)).toEqual(["b", "c"]);
    expect(AUDIT_DEFAULT_LIMIT).toBeGreaterThan(0);
  });

  it("permits persistence through a storage adapter", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key)
    };
    const trail = createIsolatedAuditTrail({ storage, now: () => Date.parse(AT) });
    trail.record({
      action: "export.generated",
      actor: { kind: "user", id: "account:G1" },
      target: { kind: "export_envelope", id: "env-1" },
      at: AT
    });
    expect([...values.values()].join("")).toContain("export.generated");
    expect(trail.all()).toHaveLength(1);
  });

  describe("maintainer query and export", () => {
    beforeEach(() => {
      record({ actor: { kind: "maintainer", id: "ada" }, target: { kind: "worker_job", id: "job-1" } });
      record({
        action: "export.generated",
        actor: { kind: "user", id: "account:G1" },
        scope: "own",
        target: { kind: "export_envelope", id: "env-1" }
      });
      record({
        action: "notification.cleared",
        actor: { kind: "user", id: "account:G2" },
        scope: "own",
        target: { kind: "notification", id: "account:G2" }
      });
    });

    it("lets a maintainer see and filter everything", () => {
      const page = getAuditTrail().query({ kind: "maintainer", id: "ada" });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      expect(page.value.total).toBe(3);

      const onlyExports = getAuditTrail().query({ kind: "maintainer", id: "ada" }, {
        action: "export.generated"
      });
      expect(onlyExports.ok && onlyExports.value.total).toBe(1);

      const byTarget = getAuditTrail().query({ kind: "maintainer", id: "ada" }, {
        targetKind: "worker_job"
      });
      expect(byTarget.ok && byTarget.value.events[0].target.id).toBe("job-1");
    });

    it("confines a user to its own own-scope events", () => {
      const page = getAuditTrail().query({ kind: "user", id: "account:G1" });
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      expect(page.value.events.map((event) => event.action)).toEqual(["export.generated"]);

      // Another user's events are invisible, and asking for them is denied.
      expect(
        getAuditTrail().query({ kind: "user", id: "account:G1" }, { actorId: "account:G2" })
      ).toEqual({ ok: false, code: "audit_denied" });
    });

    it("denies a maintainer-scope read to a user", () => {
      expect(authorizeAuditRead({ kind: "user", id: "account:G1" }, "maintainer")).toEqual({
        ok: false,
        code: "audit_denied"
      });
      expect(authorizeAuditRead({ kind: "maintainer", id: "ada" }, "maintainer").ok).toBe(true);
    });

    it("exports ndjson, json and csv for a review", () => {
      const trail = getAuditTrail();
      const ndjson = trail.export({ kind: "maintainer", id: "ada" });
      expect(ndjson.ok).toBe(true);
      if (ndjson.ok) {
        const rows = ndjson.value.split("\n");
        expect(rows).toHaveLength(3);
        expect(JSON.parse(rows[0]).action).toBe("record.state_changed");
      }

      const json = trail.export({ kind: "maintainer", id: "ada" }, { format: "json" });
      expect(json.ok && (JSON.parse(json.value).events as unknown[]).length).toBe(3);

      const csv = trail.export({ kind: "maintainer", id: "ada" }, { format: "csv" });
      expect(csv.ok).toBe(true);
      if (csv.ok) {
        const [header, row] = csv.value.split("\n");
        expect(header.startsWith("at,action,outcome,actorKind")).toBe(true);
        expect(row).toContain("record.state_changed");
      }
    });

    it("refuses to export a trail a user may not read", () => {
      expect(
        getAuditTrail().export({ kind: "user", id: "account:G1" }, { format: "json" })
      ).toMatchObject({ ok: true });
      // A user cannot widen its own read by asking for another actor's events.
      expect(
        getAuditTrail().export({ kind: "user", id: "account:G1" }, { actorId: "account:G2" })
      ).toEqual({ ok: false, code: "audit_denied" });
    });
  });

  describe("coverage at the domain boundary", () => {
    it("declares an action for every sensitive action it emits", () => {
      for (const action of SENSITIVE_ACTIONS) {
        expect(typeof action).toBe("string");
      }
      // The lifecycle hook is what makes the state-change actions exist.
      expect(isAuditedLifecycleEvent("dead_letter")).toBe(true);
      expect(isAuditedLifecycleEvent("start")).toBe(false);
      // A manual retry is sensitive; the worker's own failure is not.
      expect(isAuditedLifecycleEvent("retry", "maintainer")).toBe(true);
      expect(isAuditedLifecycleEvent("retry", "system")).toBe(false);
      expect(isAuditedLifecycleEvent("fail", "system")).toBe(false);
      // A terminal move is sensitive regardless of who made it.
      expect(isAuditedLifecycleEvent("exhaust", "system")).toBe(true);
    });

    it("audits a dead-lettered job exactly once, with the worker as actor", () => {
      const framework = createWorkerFramework();
      const job = framework.enqueue({ operation: "widget.process" });
      framework.deadLetter(job.id);

      const events = getAuditTrail()
        .all()
        .filter((event) => event.target.id === job.id && event.action === "record.state_changed");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        target: { kind: "worker_job" },
        actor: { kind: "system", id: "worker" },
        before: { state: "queued" },
        after: { state: "dead_lettered", event: "dead_letter" },
        reason: "manual_dead_letter"
      });
    });

    it("audits a refused transition as denied with its code", () => {
      const refused = applyTransition(
        workerJobMachine,
        { id: "job-9", state: "succeeded" },
        "start",
        { actor: "maintainer:ada", at: AT, reason: "operator_request" }
      );
      expect(refused.ok).toBe(false);

      const event = getAuditTrail().all()[0];
      expect(event).toMatchObject({
        action: "record.transition_denied",
        outcome: "denied",
        errorCode: "terminal_state",
        actor: { kind: "maintainer", id: "ada" },
        scope: "maintainer",
        reason: "operator_request"
      });
    });

    it("audits a manual retry, and leaves a routine run out of the trail", () => {
      const framework = createWorkerFramework();
      framework.register("ok.process", () => undefined);
      framework.register("flaky.process", () => {
        throw new Error("nope");
      });
      framework.register("flaky.exhaust", () => {
        throw new Error("nope");
      });

      const routine = framework.enqueue({ operation: "ok.process" });
      framework.drainDueJobs();
      expect(routine.status).toBe("succeeded");
      // `succeed` is telemetry-only: nothing sensitive happened.
      expect(getAuditTrail().all()).toHaveLength(0);

      const failing = framework.enqueue({ operation: "flaky.process" });
      framework.drainDueJobs();
      expect(failing.status).toBe("retrying");
      // A handler that threw is telemetry: `worker.run` already records it.
      expect(getAuditTrail().all()).toHaveLength(0);

      // Exhausting the budget is a terminal move, so it is audited.
      const exhausted = framework.enqueue({ operation: "flaky.exhaust", maxAttempts: 1 });
      framework.drainDueJobs();
      expect(exhausted.status).toBe("dead_lettered");
      expect(getAuditTrail().all()[0]).toMatchObject({
        action: "record.state_changed",
        target: { id: exhausted.id },
        reason: "attempts_exhausted"
      });
      getAuditTrail().reset();

      expect(framework.retryJob(failing.id).ok).toBe(true);
      const retried = getAuditTrail().all()[0];
      expect(retried).toMatchObject({
        action: "record.state_changed",
        target: { kind: "worker_job", id: failing.id },
        before: { state: "retrying" },
        after: { state: "queued", event: "retry" },
        reason: "manual_retry"
      });
    });

    it("audits a generated export with counts, not records", () => {
      const result = exportRecords(
        {
          schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION,
          scope: "own",
          actor: { kind: "user" },
          correlationId: "corr-export"
        },
        [source()]
      );
      expect(result.ok).toBe(true);

      const event = getAuditTrail().all()[0];
      expect(event).toMatchObject({
        action: "export.generated",
        outcome: "allowed",
        scope: "own",
        correlationId: "corr-export",
        target: { kind: "export_envelope" }
      });
      expect(event.after).toMatchObject({ recordCount: 1, totalRecords: 1, schemaVersion: "1.0" });
      // The records themselves are not in the trail: counts and metadata only.
      expect(Object.keys(event.after!)).toEqual(
        expect.arrayContaining(["recordCount", "totalRecords", "schemaVersion", "expiresAt"])
      );
    });

    it("audits a refused maintainer-scope export", () => {
      const result = exportRecords(
        { schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION, scope: "maintainer", actor: { kind: "user" } },
        [source()]
      );
      expect(result).toEqual({ ok: false, code: "export_denied" });
      expect(getAuditTrail().all()[0]).toMatchObject({
        action: "export.generated",
        outcome: "denied",
        errorCode: "export_denied"
      });
    });

    it("audits a published notification and a cleared recipient", () => {
      const recipient = `account:${`G${"A".repeat(55)}`}` as const;
      const store = new NotificationStore();
      const created = store.publish({
        recipient,
        event: "failure",
        tone: "error",
        title: "Needs attention",
        message: "Try again",
        href: "/tools/operation-browser",
        dedupeKey: "failure:1"
      });
      expect(created).not.toBeNull();
      expect(getAuditTrail().all()[0]).toMatchObject({
        action: "notification.published",
        actor: { kind: "user", id: recipient },
        target: { kind: "notification", id: created!.id },
        after: { event: "failure", tone: "error" }
      });

      store.clear(recipient);
      const cleared = getAuditTrail()
        .all()
        .find((event) => event.action === "notification.cleared")!;
      expect(cleared).toMatchObject({
        action: "notification.cleared",
        actor: { kind: "user", id: recipient },
        before: { count: 1 }
      });
    });

    it("audits a released idempotency claim", () => {
      const store = createIdempotencyStore({ now: () => Date.parse(AT) });
      store.begin({ key: "audit-key-001", operation: "worker.enqueue", correlationId: "corr-1" });
      store.abandon("audit-key-001");

      const event = getAuditTrail().all()[0];
      expect(event).toMatchObject({
        action: "idempotency.claim_released",
        target: { kind: "idempotency_record", id: "audit-key-001" },
        before: { status: "in_flight", operation: "worker.enqueue" },
        correlationId: "corr-1"
      });
    });
  });
});

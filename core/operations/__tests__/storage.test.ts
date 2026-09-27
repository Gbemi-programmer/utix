import { describe, expect, it } from "vitest";
import {
  OPERATION_STORAGE_PREFIX,
  createAdapterOperationStorage,
  createOperationStorage,
  isOperationRecord,
  type OperationRecord,
  type OperationStorageAdapter
} from "@/core/operations";

function record(overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    id: "op-1",
    kind: "ticket_flow",
    state: "running",
    correlationId: "corr-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:05.000Z",
    steps: [
      {
        id: "issue",
        status: "succeeded",
        attempt: 1,
        idempotencyKey: "operation:op-1:step:issue",
        sideEffectCommitted: true,
        updatedAt: "2026-01-01T00:00:03.000Z",
        output: { ticketId: "TCK-9" }
      },
      {
        id: "submit",
        status: "pending",
        attempt: 0,
        idempotencyKey: "operation:op-1:step:submit",
        sideEffectCommitted: false,
        updatedAt: "2026-01-01T00:00:05.000Z"
      }
    ],
    ...overrides
  };
}

/** A stand-in for `globalThis.localStorage`, with the same key ordering. */
function fakeAdapter(entries: Record<string, string> = {}): OperationStorageAdapter {
  const map = new Map<string, string>(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    }
  };
}

describe("createOperationStorage", () => {
  it("round-trips records, seeds, and removes", () => {
    const seeded = createOperationStorage([record()]);
    expect(seeded.read("op-1")?.kind).toBe("ticket_flow");
    expect(seeded.list()).toHaveLength(1);

    const storage = createOperationStorage();
    expect(storage.read("op-1")).toBeUndefined();
    storage.write(record({ id: "op-2" }));
    expect(storage.list().map((entry) => entry.id)).toEqual(["op-2"]);
    storage.remove("op-2");
    expect(storage.list()).toHaveLength(0);
  });
});

describe("createAdapterOperationStorage", () => {
  it("persists under a namespaced key and reads the record back", () => {
    const adapter = fakeAdapter();
    const storage = createAdapterOperationStorage(adapter);

    storage.write(record());

    expect(adapter.getItem(`${OPERATION_STORAGE_PREFIX}op-1`)).not.toBeNull();
    expect(storage.read("op-1")).toEqual(record());
  });

  it("treats unreadable or unrelated entries as absent", () => {
    const adapter = fakeAdapter({
      [`${OPERATION_STORAGE_PREFIX}op-1`]: "{not json",
      [`${OPERATION_STORAGE_PREFIX}op-2`]: JSON.stringify({ id: "op-2", state: "nonsense" }),
      "utix.theme": JSON.stringify({ mode: "dark" })
    });
    const storage = createAdapterOperationStorage(adapter);

    expect(storage.read("op-1")).toBeUndefined();
    expect(storage.read("op-2")).toBeUndefined();
    expect(storage.list()).toHaveLength(0);
    expect(storage.read("missing")).toBeUndefined();
  });

  it("lists every stored operation and ignores other app state", () => {
    const adapter = fakeAdapter({ "utix.theme": "dark" });
    const storage = createAdapterOperationStorage(adapter);
    storage.write(record({ id: "op-1" }));
    storage.write(record({ id: "op-2" }));

    expect(storage.list().map((entry) => entry.id).sort()).toEqual(["op-1", "op-2"]);

    storage.remove("op-1");
    expect(storage.list().map((entry) => entry.id)).toEqual(["op-2"]);
    expect(adapter.getItem("utix.theme")).toBe("dark");
  });
});

describe("isOperationRecord", () => {
  it("accepts a well-formed record and rejects everything else", () => {
    expect(isOperationRecord(record())).toBe(true);
    expect(isOperationRecord(null)).toBe(false);
    expect(isOperationRecord("op-1")).toBe(false);
    expect(isOperationRecord({})).toBe(false);
    expect(isOperationRecord({ ...record(), state: "paused" })).toBe(false);
    expect(isOperationRecord({ ...record(), steps: "issue" })).toBe(false);
    expect(
      isOperationRecord({
        ...record(),
        steps: [{ ...record().steps[0], status: "waiting" }]
      })
    ).toBe(false);
    expect(
      isOperationRecord({
        ...record(),
        steps: [{ ...record().steps[0], sideEffectCommitted: "yes" }]
      })
    ).toBe(false);
  });
});

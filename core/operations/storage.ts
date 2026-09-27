/**
 * Storage for operation records.
 *
 * The runner never touches a storage backend directly; it goes through
 * `OperationStorage` so the same flow can be driven by an in-memory map in a
 * test, by `localStorage` in a resumed browser tab, or by an IndexedDB adapter
 * without changing a line of the flow.
 */

import {
  OPERATION_STATES,
  STEP_STATUSES,
  type OperationRecord,
  type OperationState,
  type OperationStorage,
  type StepCheckpoint,
  type StepStatus
} from "@/core/operations/types";

/** Key prefix, so an adapter can be shared with unrelated app state. */
export const OPERATION_STORAGE_PREFIX = "utix.operations.";

/** The slice of the Web Storage API this module needs. */
export interface OperationStorageAdapter {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isStepStatus(value: unknown): value is StepStatus {
  return typeof value === "string" && (STEP_STATUSES as readonly string[]).includes(value);
}

function isOperationState(value: unknown): value is OperationState {
  return typeof value === "string" && (OPERATION_STATES as readonly string[]).includes(value);
}

function isCheckpoint(value: unknown): value is StepCheckpoint {
  if (typeof value !== "object" || value === null) return false;
  const checkpoint = value as Record<string, unknown>;
  return (
    typeof checkpoint.id === "string" &&
    isStepStatus(checkpoint.status) &&
    typeof checkpoint.attempt === "number" &&
    Number.isFinite(checkpoint.attempt) &&
    checkpoint.attempt >= 0 &&
    typeof checkpoint.idempotencyKey === "string" &&
    typeof checkpoint.sideEffectCommitted === "boolean" &&
    typeof checkpoint.updatedAt === "string"
  );
}

/**
 * Validates an untrusted value — a stored string, a fixture, a test double.
 * A record that fails this check is treated as absent rather than trusted.
 */
export function isOperationRecord(value: unknown): value is OperationRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.kind !== "string" ||
    !isOperationState(record.state) ||
    typeof record.correlationId !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return false;
  }
  return Array.isArray(record.steps) && record.steps.every(isCheckpoint);
}

function parseRecord(raw: string): OperationRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isOperationRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** In-memory storage. The default for tests and for a single page session. */
export function createOperationStorage(
  seed: readonly OperationRecord[] = []
): OperationStorage {
  const records = new Map<string, OperationRecord>();
  for (const record of seed) {
    records.set(record.id, record);
  }
  return {
    read: (id) => records.get(id),
    write: (record) => {
      records.set(record.id, record);
    },
    remove: (id) => {
      records.delete(id);
    },
    list: () => [...records.values()]
  };
}

/**
 * Adapts any `getItem`/`setItem` backend. `globalThis.localStorage` fits
 * directly, which is what makes a reload mid-operation survivable.
 */
export function createAdapterOperationStorage(
  adapter: OperationStorageAdapter
): OperationStorage {
  return {
    read(id) {
      const raw = adapter.getItem(OPERATION_STORAGE_PREFIX + id);
      return raw === null ? undefined : parseRecord(raw);
    },
    write(record) {
      adapter.setItem(OPERATION_STORAGE_PREFIX + record.id, JSON.stringify(record));
    },
    remove(id) {
      adapter.removeItem(OPERATION_STORAGE_PREFIX + id);
    },
    list() {
      const records: OperationRecord[] = [];
      for (let index = 0; index < adapter.length; index += 1) {
        const key = adapter.key(index);
        if (key === null || !key.startsWith(OPERATION_STORAGE_PREFIX)) continue;
        const raw = adapter.getItem(key);
        if (raw === null) continue;
        const record = parseRecord(raw);
        if (record) records.push(record);
      }
      return records;
    }
  };
}

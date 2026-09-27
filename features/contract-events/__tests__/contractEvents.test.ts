import { beforeEach, describe, expect, it } from "vitest";
import { withMswHandlers } from "@/core/testing/msw";
import {
  DEFAULT_WINDOW,
  MAX_PAGES,
  PAGE_LIMIT,
  fetchContractEvents,
  normalizeEvent
} from "@/features/contract-events/lib/contractEvents";
import {
  fromRpcFailure,
  toContractEventsErrorCode
} from "@/features/contract-events/lib/contractEvents.errors";
import {
  handlers,
  rateLimitedHandler,
  rpcErrorHandler,
  seen,
  unreachableHandler
} from "@/features/contract-events/msw/handlers";
import {
  busyContractId,
  contractId,
  expiredContractId,
  latestLedger,
  outOfRangeMessage,
  quietContractId,
  transferAmount,
  transferEvent,
  undecodableEvent
} from "@/features/contract-events/fixtures/contractEvents.fixture";

const server = withMswHandlers(...handlers);

beforeEach(() => {
  seen.getEvents.length = 0;
});

describe("normalizeEvent", () => {
  it("decodes every topic and the value", () => {
    const event = normalizeEvent(transferEvent);
    expect(event.topics.map((topic) => topic.type)).toEqual(["Symbol", "Address", "Address", "String"]);
    expect(event.value.display).toBe(transferAmount);
    expect(event.inSuccessfulContractCall).toBe(true);
  });

  it("keeps an undecodable event with its raw XDR", () => {
    const event = normalizeEvent(undecodableEvent);
    expect(event.type).toBe("diagnostic");
    expect(event.topics[0]).toMatchObject({ decoded: false, raw: "not-xdr" });
    expect(event.txHash).toBe("");
  });

  it("treats a missing success flag and topic list as defaults", () => {
    const event = normalizeEvent({ ...transferEvent, inSuccessfulContractCall: undefined, topic: undefined });
    expect(event.inSuccessfulContractCall).toBe(true);
    expect(event.topics).toEqual([]);
  });
});

describe("fetchContractEvents", () => {
  it("filters getEvents by contract over the given range", async () => {
    const result = await fetchContractEvents({ contractId, startLedger: 49_000, endLedger: 50_000 }, "testnet");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.events).toHaveLength(3);
    expect(result.value).toMatchObject({ startLedger: 49_000, endLedger: 50_000, latestLedger, truncated: false });
    expect(seen.getEvents[0]).toEqual({
      startLedger: 49_000,
      endLedger: 50_000,
      filters: [{ type: "contract", contractIds: [contractId] }],
      pagination: { limit: PAGE_LIMIT }
    });
  });

  it("starts a recent window back from the latest ledger when no start is given", async () => {
    const result = await fetchContractEvents({ contractId }, "testnet");

    expect(result.ok && result.value.startLedger).toBe(latestLedger - DEFAULT_WINDOW);
    expect(seen.getEvents[0]).not.toHaveProperty("endLedger");
  });

  it("drops events at or past the exclusive end ledger", async () => {
    const result = await fetchContractEvents({ contractId, startLedger: 49_000, endLedger: 49_600 }, "testnet");
    expect(result.ok && result.value.events.map((event) => event.ledger)).toEqual([49_500]);
  });

  it("returns an empty list for a contract with no events", async () => {
    const result = await fetchContractEvents({ contractId: quietContractId, startLedger: 1 }, "testnet");
    expect(result.ok && result.value.events).toEqual([]);
  });

  it("follows the cursor and stops at the page cap", async () => {
    const result = await fetchContractEvents({ contractId: busyContractId, startLedger: 1 }, "testnet");

    expect(result.ok && result.value.truncated).toBe(true);
    expect(result.ok && result.value.events).toHaveLength(PAGE_LIMIT * MAX_PAGES);
    expect(seen.getEvents).toHaveLength(MAX_PAGES);
    // Cursor pages must not also carry a start ledger; the RPC rejects both together.
    expect(seen.getEvents[1]).not.toHaveProperty("startLedger");
    expect(seen.getEvents[1].pagination).toEqual({ cursor: "page-1", limit: PAGE_LIMIT });
  });

  it("maps a retention-window rejection to ledger_out_of_range", async () => {
    const result = await fetchContractEvents({ contractId: expiredContractId, startLedger: 1 }, "testnet");
    expect(result).toEqual({ ok: false, code: "ledger_out_of_range" });
  });

  it("maps other JSON-RPC errors to rpc_error", async () => {
    server.use(rpcErrorHandler);
    const result = await fetchContractEvents({ contractId, startLedger: 1 }, "testnet");
    expect(result).toEqual({ ok: false, code: "rpc_error" });
  });

  it("maps HTTP 429 to rate_limited", async () => {
    server.use(rateLimitedHandler);
    expect(await fetchContractEvents({ contractId }, "testnet")).toEqual({ ok: false, code: "rate_limited" });
  });

  it("maps a transport failure to request_failed", async () => {
    server.use(unreachableHandler);
    expect(await fetchContractEvents({ contractId, startLedger: 1 }, "testnet")).toEqual({
      ok: false,
      code: "request_failed"
    });
  });
});

describe("error mapping", () => {
  it("recognises the RPC's out-of-range wording", () => {
    const failure = { jsonrpc: "2.0" as const, id: 1, error: { code: -32600, message: outOfRangeMessage } };
    expect(fromRpcFailure(failure)).toBe("ledger_out_of_range");
    expect(fromRpcFailure({ ...failure, error: { code: -32600, message: "bad" } })).toBe("rpc_error");
  });

  it("classifies thrown errors by status", () => {
    expect(toContractEventsErrorCode(Object.assign(new Error("x"), { status: 429 }))).toBe("rate_limited");
    expect(toContractEventsErrorCode(Object.assign(new Error("x"), { status: 500 }))).toBe("request_failed");
    expect(toContractEventsErrorCode(null)).toBe("request_failed");
  });
});

import { delay, http, HttpResponse } from "msw";
import { SOROBAN_RPC_URLS } from "@/core/network/config";
import { PAGE_LIMIT } from "@/features/contract-events/lib/contractEvents";
import {
  busyContractId,
  busyEvents,
  contractId,
  events,
  expiredContractId,
  latestLedger,
  outOfRangeMessage
} from "@/features/contract-events/fixtures/contractEvents.fixture";

const TESTNET = SOROBAN_RPC_URLS.testnet;

interface RpcRequest {
  id: number;
  method: string;
  params: {
    startLedger?: number;
    filters?: { contractIds?: string[] }[];
    pagination?: { cursor?: string; limit?: number };
  };
}

const success = (id: number, result: unknown) => HttpResponse.json({ jsonrpc: "2.0", id, result });
const failure = (id: number, code: number, message: string) =>
  HttpResponse.json({ jsonrpc: "2.0", id, error: { code, message } });

/** The last getEvents request each handler saw, so tests can assert on parameters. */
export const seen: { getEvents: RpcRequest["params"][] } = { getEvents: [] };

export const handlers = [
  http.post(TESTNET, async ({ request }) => {
    const body = (await request.json()) as RpcRequest;

    if (body.method === "getLatestLedger") {
      return success(body.id, { id: "abc", protocolVersion: 22, sequence: latestLedger });
    }

    if (body.method !== "getEvents") return failure(body.id, -32601, "method not found");

    seen.getEvents.push(body.params);
    const target = body.params.filters?.[0]?.contractIds?.[0];

    if (target === expiredContractId) return failure(body.id, -32600, outOfRangeMessage);

    if (target === busyContractId) {
      // Every page is full, so the client has to stop at its page cap.
      const page = Number(body.params.pagination?.cursor?.replace("page-", "") ?? 0);
      return success(body.id, {
        events: busyEvents(page, PAGE_LIMIT),
        latestLedger,
        cursor: `page-${page + 1}`
      });
    }

    return success(body.id, {
      events: target === contractId ? events : [],
      latestLedger,
      cursor: "end"
    });
  })
];

export const rateLimitedHandler = http.post(TESTNET, () =>
  HttpResponse.json({ message: "slow down" }, { status: 429 })
);

export const unreachableHandler = http.post(TESTNET, () => HttpResponse.error());

export const rpcErrorHandler = http.post(TESTNET, async ({ request }) => {
  const body = (await request.json()) as RpcRequest;
  return failure(body.id, -32602, "invalid filter");
});

/** Keeps the request in flight so the loading state can be observed. */
export const pendingHandler = http.post(TESTNET, async () => {
  await delay("infinite");
  return HttpResponse.json({});
});

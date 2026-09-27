import { err, ok, type Result } from "@/core/result/result";
import { isRpcFailure, sorobanRpc } from "@/core/rpc/client";
import type { StellarNetwork } from "@/core/network/types";
import { decodeScValXdr } from "@/features/contract-events/lib/format";
import {
  fromRpcFailure,
  toContractEventsErrorCode
} from "@/features/contract-events/lib/contractEvents.errors";
import type {
  ContractEvent,
  ContractEventType,
  ContractEventsErrorCode,
  ContractEventsInput,
  ContractEventsResult
} from "@/features/contract-events/types";

/** Events per getEvents page. */
export const PAGE_LIMIT = 100;
/** Pages followed before stopping; keeps a busy contract from turning into dozens of requests. */
export const MAX_PAGES = 5;
/** Ledgers read back from the latest when no start ledger is given (~1.4 hours at 5s a ledger). */
export const DEFAULT_WINDOW = 1_000;

export interface RpcEvent {
  type: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  id: string;
  txHash?: string;
  inSuccessfulContractCall?: boolean;
  topic?: string[];
  value: string;
}

export interface GetEventsResponse {
  events: RpcEvent[] | null;
  latestLedger: number;
  cursor?: string;
}

interface GetLatestLedgerResponse {
  sequence: number;
}

function eventType(type: string): ContractEventType {
  return type === "system" || type === "diagnostic" ? type : "contract";
}

export function normalizeEvent(event: RpcEvent): ContractEvent {
  return {
    id: event.id,
    type: eventType(event.type),
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    contractId: event.contractId,
    txHash: event.txHash ?? "",
    // Older RPC versions omit the flag; events are only returned for included
    // transactions, so absence is read as success.
    inSuccessfulContractCall: event.inSuccessfulContractCall ?? true,
    topics: (event.topic ?? []).map(decodeScValXdr),
    value: decodeScValXdr(event.value)
  };
}

type Step<T> = Result<T, ContractEventsErrorCode>;

async function call<T>(
  method: string,
  params: unknown,
  network: StellarNetwork,
  signal?: AbortSignal
): Promise<Step<T>> {
  try {
    const response = await sorobanRpc<T>(method, params, { network, signal });
    return isRpcFailure(response) ? err(fromRpcFailure(response)) : ok(response.result);
  } catch (error) {
    return err(toContractEventsErrorCode(error));
  }
}

async function resolveStartLedger(
  input: ContractEventsInput,
  network: StellarNetwork,
  signal?: AbortSignal
): Promise<Step<number>> {
  if (input.startLedger !== undefined) return ok(input.startLedger);

  const latest = await call<GetLatestLedgerResponse>("getLatestLedger", {}, network, signal);
  if (!latest.ok) return latest;
  return ok(Math.max(1, latest.value.sequence - DEFAULT_WINDOW));
}

export async function fetchContractEvents(
  input: ContractEventsInput,
  network: StellarNetwork,
  signal?: AbortSignal
): Promise<Result<ContractEventsResult, ContractEventsErrorCode>> {
  const start = await resolveStartLedger(input, network, signal);
  if (!start.ok) return start;

  const filters = [{ type: "contract", contractIds: [input.contractId] }];
  const events: ContractEvent[] = [];
  let latestLedger = 0;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    // The first page is addressed by ledger; later pages by cursor, and the RPC
    // rejects a request that carries both.
    const params = cursor
      ? { filters, pagination: { cursor, limit: PAGE_LIMIT } }
      : {
          startLedger: start.value,
          ...(input.endLedger !== undefined ? { endLedger: input.endLedger } : {}),
          filters,
          pagination: { limit: PAGE_LIMIT }
        };

    const response = await call<GetEventsResponse>("getEvents", params, network, signal);
    if (!response.ok) return response;

    const batch = response.value.events ?? [];
    latestLedger = response.value.latestLedger;

    for (const event of batch) {
      // A cursor page can run past the requested end ledger; stop at the bound.
      if (input.endLedger !== undefined && event.ledger >= input.endLedger) {
        return ok(result(input, start.value, latestLedger, events, false));
      }
      events.push(normalizeEvent(event));
    }

    if (batch.length < PAGE_LIMIT || !response.value.cursor) {
      return ok(result(input, start.value, latestLedger, events, false));
    }

    cursor = response.value.cursor;
  }

  // Every page came back full: the range holds more events than were read.
  return ok(result(input, start.value, latestLedger, events, true));
}

function result(
  input: ContractEventsInput,
  startLedger: number,
  latestLedger: number,
  events: ContractEvent[],
  truncated: boolean
): ContractEventsResult {
  return {
    contractId: input.contractId,
    startLedger,
    endLedger: input.endLedger,
    latestLedger,
    events,
    truncated
  };
}

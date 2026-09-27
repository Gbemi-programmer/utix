import type { JsonRpcFailure } from "@/core/rpc/client";
import type { ContractEventsErrorCode } from "@/features/contract-events/types";

/**
 * Soroban RPC reports a start ledger outside its retention window as a
 * generic invalid-params error; only the message tells it apart, e.g.
 * "startLedger must be between the oldest ledger: 100 and the latest ledger: 200".
 */
const OUT_OF_RANGE = /(start|end)\s*ledger.*(between|before|after|oldest|latest|range)/i;

export function fromRpcFailure(failure: JsonRpcFailure): ContractEventsErrorCode {
  if (OUT_OF_RANGE.test(failure.error.message)) return "ledger_out_of_range";
  return "rpc_error";
}

/** Maps a thrown transport failure (non-2xx status, network error, abort). */
export function toContractEventsErrorCode(error: unknown): ContractEventsErrorCode {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 429) return "rate_limited";
  return "request_failed";
}

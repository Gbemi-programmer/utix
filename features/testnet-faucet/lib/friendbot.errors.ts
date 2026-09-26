import { isCancelledError, isTimeoutError } from "@/core/horizon/request";
import type { FaucetErrorCode } from "@/features/testnet-faucet/types";

/** Maps a thrown transport failure (no HTTP response at all) to a faucet code. */
export function toFaucetErrorCode(error: unknown): FaucetErrorCode {
  if (isTimeoutError(error)) return "timeout";
  if (isCancelledError(error)) return "request_failed";

  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("abort")) return "request_failed";
  if (message.includes("fetch") || message.includes("network")) {
    return "friendbot_unavailable";
  }

  return "request_failed";
}

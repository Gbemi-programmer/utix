import { classifyHorizonError } from "@/core/horizon/errors";
import type { PathPaymentFinderErrorCode } from "@/features/path-payment-finder/types";

export function toPathPaymentFinderErrorCode(error: unknown): PathPaymentFinderErrorCode {
  if (error === "invalid_input" || error === "no_routes_found") {
    return error;
  }

  const { code } = classifyHorizonError(error);

  if (code === "rate_limited") return "rate_limited";
  if (code === "bad_request") return "invalid_input";
  return "request_failed";
}

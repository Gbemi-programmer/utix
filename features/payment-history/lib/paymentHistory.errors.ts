import { classifyHorizonError } from "@/core/horizon/errors";
import type { PaymentHistoryErrorCode } from "@/features/payment-history/types";

export function toPaymentHistoryErrorCode(error: unknown): PaymentHistoryErrorCode {
  const { code } = classifyHorizonError(error);

  if (code === "not_found") return "account_not_found";
  if (code === "rate_limited") return "rate_limited";
  return "request_failed";
}

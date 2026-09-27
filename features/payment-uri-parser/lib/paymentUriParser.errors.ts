import type { PaymentUriParserErrorCode } from "@/features/payment-uri-parser/types";

export function toPaymentUriParserErrorCode(error: unknown): PaymentUriParserErrorCode {
  if (
    error === "empty_input" ||
    error === "invalid_scheme" ||
    error === "unknown_operation" ||
    error === "invalid_uri" ||
    error === "secret_key_detected"
  ) {
    return error;
  }
  return "invalid_uri";
}

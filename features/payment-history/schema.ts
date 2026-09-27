import { StrKey } from "@stellar/stellar-sdk";
import { err, ok, type Result } from "@/core/result/result";
import type {
  PaymentHistoryErrorCode,
  PaymentHistoryInput
} from "@/features/payment-history/types";

export function parsePaymentHistoryInput(
  raw: string
): Result<PaymentHistoryInput, PaymentHistoryErrorCode> {
  const accountId = raw.replace(/\s+/g, "");

  if (!accountId) return err("empty_input");
  if (!StrKey.isValidEd25519PublicKey(accountId)) return err("invalid_address");

  return ok({ accountId });
}

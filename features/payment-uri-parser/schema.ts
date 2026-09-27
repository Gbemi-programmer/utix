import { err, ok, type Result } from "@/core/result/result";
import { StrKey } from "@stellar/stellar-sdk";
import type {
  PaymentUriParserErrorCode,
  PaymentUriParserInput
} from "@/features/payment-uri-parser/types";

function containsSecretKey(text: string): boolean {
  const matches = text.match(/S[A-Z0-9]{55}/g);
  if (matches && matches.length > 0) {
    return true;
  }
  return false;
}

export function validatePaymentUriInput(
  raw: unknown
): Result<PaymentUriParserInput, PaymentUriParserErrorCode> {
  const inputStr = typeof raw === "string" ? raw.trim() : "";
  if (!inputStr) {
    return err("empty_input");
  }

  if (containsSecretKey(inputStr)) {
    return err("secret_key_detected");
  }

  if (!inputStr.startsWith("web+stellar:")) {
    return err("invalid_scheme");
  }

  const remainder = inputStr.slice("web+stellar:".length);
  const qIndex = remainder.indexOf("?");
  const operation = (qIndex >= 0 ? remainder.slice(0, qIndex) : remainder).toLowerCase();

  if (operation !== "pay" && operation !== "tx") {
    return err("unknown_operation");
  }

  return ok({
    uri: inputStr
  });
}

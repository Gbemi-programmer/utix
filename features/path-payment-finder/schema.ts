import { err, ok, type Result } from "@/core/result/result";
import { StrKey } from "@stellar/stellar-sdk";
import type {
  PathMode,
  PathPaymentFinderErrorCode,
  PathPaymentFinderInput
} from "@/features/path-payment-finder/types";

function isSecretKey(val: string): boolean {
  const trimmed = val.trim();
  if (trimmed.startsWith("S") && trimmed.length === 56) return true;
  try {
    return StrKey.isValidEd25519SecretSeed(trimmed);
  } catch {
    return false;
  }
}

function isValidAssetCode(code: string): boolean {
  return /^[A-Za-z0-9]{1,12}$/.test(code);
}

function isValidIssuer(issuer: string): boolean {
  return (
    !issuer.startsWith("S") &&
    issuer.length === 56 &&
    StrKey.isValidEd25519PublicKey(issuer)
  );
}

export function validatePathPaymentFinderInput(
  raw: unknown
): Result<PathPaymentFinderInput, PathPaymentFinderErrorCode> {
  if (!raw || typeof raw !== "object") {
    return err("invalid_input");
  }

  const data = raw as Record<string, unknown>;

  const mode = (data.mode as PathMode) || "strict-send";
  if (mode !== "strict-send" && mode !== "strict-receive") {
    return err("invalid_input");
  }

  const amount = typeof data.amount === "string" ? data.amount.trim() : "";
  if (
    !amount ||
    !/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(amount) ||
    Number(amount) <= 0
  ) {
    return err("invalid_input");
  }

  const sourceCode = typeof data.sourceCode === "string" ? data.sourceCode.trim().toUpperCase() : "";
  const sourceIssuer = typeof data.sourceIssuer === "string" ? data.sourceIssuer.trim() : "";

  const destCode = typeof data.destCode === "string" ? data.destCode.trim().toUpperCase() : "";
  const destIssuer = typeof data.destIssuer === "string" ? data.destIssuer.trim() : "";

  if (
    isSecretKey(sourceCode) ||
    isSecretKey(sourceIssuer) ||
    isSecretKey(destCode) ||
    isSecretKey(destIssuer)
  ) {
    return err("invalid_input");
  }

  if (!isValidAssetCode(sourceCode) || !isValidAssetCode(destCode)) {
    return err("invalid_input");
  }

  if (sourceCode !== "XLM" && !isValidIssuer(sourceIssuer)) {
    return err("invalid_input");
  }

  if (destCode !== "XLM" && !isValidIssuer(destIssuer)) {
    return err("invalid_input");
  }

  // Assets cannot be identical
  const sourceKey = sourceCode === "XLM" ? "native" : `${sourceCode}:${sourceIssuer}`;
  const destKey = destCode === "XLM" ? "native" : `${destCode}:${destIssuer}`;
  if (sourceKey === destKey) {
    return err("invalid_input");
  }

  return ok({
    mode,
    sourceCode,
    sourceIssuer: sourceCode === "XLM" ? undefined : sourceIssuer,
    destCode,
    destIssuer: destCode === "XLM" ? undefined : destIssuer,
    amount
  });
}

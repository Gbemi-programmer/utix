import { StrKey } from "@stellar/stellar-sdk";
import { shouldRedact } from "@/features/batch-address-validator/lib/batchAddressValidator.errors";

function validateAddress({ address }: { address: string }): {
  valid: boolean;
  code: import("@/features/batch-address-validator/types").AddressValidationCode;
  address: string;
} {
  const prefix = address[0]?.toUpperCase() ?? "";
  if (prefix === "S") {
    return { valid: false, code: "secret_seed_rejected", address: "" };
  }
  if (!["G", "M", "C", "T", "X", "P"].includes(prefix)) {
    return { valid: false, code: "unknown_prefix", address };
  }
  if (prefix !== "G") {
    return { valid: false, code: "unsupported_kind", address };
  }
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return { valid: false, code: "bad_checksum_or_length", address };
  }
  return { valid: true, code: "valid", address };
}
import type {
  BatchAddressValidatorInput,
  BatchAddressValidatorResult,
  BatchAddressValidatorSummary,
  BatchLineResult
} from "@/features/batch-address-validator/types";

/** Validates every address in a parsed list and builds per-line results plus a summary. */
export function runBatchAddressValidator(
  input: BatchAddressValidatorInput
): BatchAddressValidatorResult {
  const normalized = input.lines.map((raw) => raw.replace(/\s+/g, ""));

  const occurrences = new Map<string, number[]>();
  normalized.forEach((address, index) => {
    if (!address) return;
    const lines = occurrences.get(address) ?? [];
    lines.push(index + 1);
    occurrences.set(address, lines);
  });

  const lines: BatchLineResult[] = input.lines.map((_, index) => {
    const line = index + 1;
    const address = normalized[index];
    const validation = validateAddress({ address });
    const duplicateLines = occurrences.get(address);

    return {
      line,
      address: shouldRedact(validation.code) ? "" : validation.address,
      valid: validation.valid,
      code: validation.code,
      duplicateLines: duplicateLines && duplicateLines.length > 1 ? duplicateLines : undefined
    };
  });

  const summary: BatchAddressValidatorSummary = {
    total: lines.length,
    valid: lines.filter((entry) => entry.valid).length,
    invalid: lines.filter((entry) => !entry.valid).length,
    duplicated: lines.filter((entry) => entry.duplicateLines).length,
    secretSeeds: lines.filter((entry) => entry.code === "secret_seed_rejected").length
  };

  return { lines, summary };
}

/** Returns each validated public G-address once, preserving first occurrence order. */
export function cleanUniquePublicAddresses(result: BatchAddressValidatorResult): string[] {
  const seen = new Set<string>();
  return result.lines.reduce<string[]>((addresses, entry) => {
    if (entry.valid && entry.address.startsWith("G") && !seen.has(entry.address)) {
      seen.add(entry.address);
      addresses.push(entry.address);
    }
    return addresses;
  }, []);
}

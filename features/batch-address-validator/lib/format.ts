import type { AddressValidationCode } from "@/features/batch-address-validator/types";
import { copy } from "@/features/batch-address-validator/copy";
import type { BatchAddressValidatorSummary } from "@/features/batch-address-validator/types";

const reasonTitles: Record<Exclude<AddressValidationCode, "valid" | "empty_input">, string> = {
  secret_seed_rejected: "That looks like a secret key",
  unknown_prefix: "This does not look like a Stellar address",
  bad_checksum_or_length: "The checksum or length is wrong",
  unsupported_kind: "Valid, but not an account address"
};

export function formatSummary(summary: BatchAddressValidatorSummary): string {
  const parts = [
    copy.summaryValid(summary.valid),
    copy.summaryInvalid(summary.invalid),
    copy.summaryDuplicated(summary.duplicated)
  ];

  if (summary.secretSeeds > 0) {
    parts.push(copy.summarySecretSeeds(summary.secretSeeds));
  }

  return parts.join(" · ");
}

export function formatLineReason(code: AddressValidationCode): string {
  if (code === "valid") return copy.lineValid;
  if (code === "empty_input") return copy.lineEmpty;

  return reasonTitles[code] ?? code;
}

export function formatDuplicateLines(lines: number[]): string {
  return copy.duplicateLines(lines);
}

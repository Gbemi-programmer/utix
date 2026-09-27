import type { AddressValidationCode } from "@/features/batch-address-validator/types";

export function shouldRedact(code: AddressValidationCode): boolean {
  return code === "secret_seed_rejected";
}

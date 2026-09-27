import { StrKey } from "@stellar/stellar-sdk";
import { err, ok, type Result } from "@/core/result/result";
import type {
  ContractEventsErrorCode,
  ContractEventsInput
} from "@/features/contract-events/types";

export interface RawContractEventsInput {
  contractId: string;
  startLedger: string;
  endLedger: string;
}

const LEDGER = /^\d+$/;
/** Ledger sequences are uint32 on the wire. */
const MAX_LEDGER = 4_294_967_295;

function parseLedger(raw: string): number | null | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (!LEDGER.test(value)) return null;
  const ledger = Number(value);
  return ledger >= 1 && ledger <= MAX_LEDGER ? ledger : null;
}

export function parseContractEventsInput(
  raw: RawContractEventsInput
): Result<ContractEventsInput, ContractEventsErrorCode> {
  const contractId = raw.contractId.replace(/\s+/g, "");

  if (!contractId) return err("empty_contract_id");
  // Rejected on the prefix alone, before any checksum work, so a seed is never
  // parsed, echoed back or sent anywhere.
  if (/^s/i.test(contractId)) return err("secret_key");

  const upper = contractId.toUpperCase();
  if (upper.startsWith("G") || upper.startsWith("M")) return err("account_address");
  if (!StrKey.isValidContract(upper)) return err("invalid_contract_id");

  const startLedger = parseLedger(raw.startLedger);
  if (startLedger === null) return err("invalid_start_ledger");

  const endLedger = parseLedger(raw.endLedger);
  if (endLedger === null) return err("invalid_end_ledger");

  // Soroban RPC treats endLedger as exclusive, so an equal pair is an empty window.
  if (endLedger !== undefined && startLedger !== undefined && endLedger <= startLedger) {
    return err("invalid_range");
  }

  return ok({ contractId: upper, startLedger, endLedger });
}

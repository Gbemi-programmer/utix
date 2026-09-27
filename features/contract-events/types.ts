/** Soroban RPC reports three kinds of event; contract events are the ones a contract emits itself. */
export type ContractEventType = "contract" | "system" | "diagnostic";

/** One ScVal rendered for reading, with the original base64 kept for copying. */
export interface DecodedScVal {
  /** ScVal arm without the `scv` prefix, e.g. `Symbol`, `I128`, `Map`. */
  type: string;
  /** Human-readable rendering. Equal to `raw` when the value could not be decoded. */
  display: string;
  /** The base64 XDR exactly as the RPC returned it. */
  raw: string;
  decoded: boolean;
}

export interface ContractEvent {
  id: string;
  type: ContractEventType;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  txHash: string;
  inSuccessfulContractCall: boolean;
  topics: DecodedScVal[];
  value: DecodedScVal;
}

export interface ContractEventsInput {
  contractId: string;
  /** Omitted to mean "the most recent window before the latest ledger". */
  startLedger?: number;
  /** Exclusive upper bound, as Soroban RPC defines it. */
  endLedger?: number;
}

export interface ContractEventsResult {
  contractId: string;
  startLedger: number;
  endLedger?: number;
  latestLedger: number;
  events: ContractEvent[];
  /** True when the page cap was reached and more events may exist in the range. */
  truncated: boolean;
}

export type ContractEventsErrorCode =
  | "empty_contract_id"
  | "secret_key"
  | "account_address"
  | "invalid_contract_id"
  | "invalid_start_ledger"
  | "invalid_end_ledger"
  | "invalid_range"
  | "ledger_out_of_range"
  | "rate_limited"
  | "rpc_error"
  | "request_failed";

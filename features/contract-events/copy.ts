import type { ContractEventsErrorCode } from "@/features/contract-events/types";

export const copy = {
  contractLabel: "Contract ID",
  contractHint: "The C… StrKey of the Soroban contract.",
  startLabel: "Start ledger",
  startHint: "Optional. Leave blank to read the most recent ledgers.",
  endLabel: "End ledger",
  endHint: "Optional and exclusive: events up to, not including, this ledger.",
  submit: "Fetch events",
  loading: "Fetching events...",
  emptyTitle: "No events fetched yet",
  emptyDescription:
    "Enter a contract ID to read the events it emitted, with every topic and value decoded.",
  summaryTitle: "Query",
  eventsTitle: "Events",
  noEvents: "This contract emitted no events in the selected ledger range.",
  truncated:
    "Only the first events in this range are shown. Narrow the ledger range to see the rest.",
  topicsLabel: "Topics",
  valueLabel: "Value",
  failedCall: "Emitted by a call that later failed",
  undecoded: "Could not decode this value; showing the raw XDR.",
  latestLedgerLabel: "Latest ledger",
  rangeLabel: "Ledger range",
  openEnded: "latest"
} as const;

export const errorCopy: Record<ContractEventsErrorCode, { title: string; description: string }> = {
  empty_contract_id: {
    title: "Enter a contract ID",
    description: "Paste the C… address of the contract whose events you want to read."
  },
  secret_key: {
    title: "That looks like a secret key",
    description:
      "Secret keys start with S and must never be pasted into a web tool. It was not stored or sent. Paste the contract's C… ID instead."
  },
  account_address: {
    title: "That is an account, not a contract",
    description:
      "Addresses starting with G or M are accounts. Contract IDs start with C — the Contract ID Inspector can convert a hex ID to that form."
  },
  invalid_contract_id: {
    title: "That is not a valid contract ID",
    description: "Contract IDs are 56 characters starting with C. Check for a missing or mistyped character."
  },
  invalid_start_ledger: {
    title: "The start ledger is not a ledger number",
    description: "Use a whole ledger sequence number such as 1234567, or leave it blank."
  },
  invalid_end_ledger: {
    title: "The end ledger is not a ledger number",
    description: "Use a whole ledger sequence number such as 1234600, or leave it blank."
  },
  invalid_range: {
    title: "The end ledger must be after the start ledger",
    description: "The end ledger is exclusive, so it has to be at least one higher than the start."
  },
  ledger_out_of_range: {
    title: "That ledger range is outside what this RPC keeps",
    description:
      "Soroban RPC only retains recent ledgers (about seven days). Choose a start ledger inside that window, or leave it blank."
  },
  rate_limited: {
    title: "Soroban RPC is rate limiting this request",
    description: "Wait a moment before fetching events again."
  },
  rpc_error: {
    title: "Soroban RPC rejected the request",
    description: "Check the contract ID and ledger range, then try again."
  },
  request_failed: {
    title: "Could not reach Soroban RPC",
    description: "The request did not complete. Check your connection and try again."
  }
};

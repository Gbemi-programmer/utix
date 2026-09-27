import type { PaymentHistoryErrorCode } from "@/features/payment-history/types";

export const copy = {
  formLabel: "Account address",
  formHint: "Public G-address whose payments you want to browse.",
  submit: "Fetch payment history",
  loading: "Loading payments...",
  emptyTitle: "No account selected",
  emptyDescription: "Enter a Stellar public key to inspect its incoming and outgoing payment history.",
  noPaymentsTitle: "No payments found",
  noPaymentsDescription: "This account exists on the network but has no payment operations recorded.",
  resultTitle: "Payment history",
  directionIncoming: "IN",
  directionOutgoing: "OUT",
  counterpartyLabel: "Counterparty",
  amountLabel: "Amount",
  txLabel: "Transaction",
  dateLabel: "Date",
  prevPage: "Previous page",
  nextPage: "Next page"
} as const;

export const errorCopy: Record<PaymentHistoryErrorCode, { title: string; description: string }> = {
  empty_input: {
    title: "Enter an account address",
    description: "Provide a valid Stellar G-address to retrieve its payment history."
  },
  invalid_address: {
    title: "Invalid Stellar address",
    description: "The address must be a valid 56-character Ed25519 public key starting with G."
  },
  account_not_found: {
    title: "Account not found",
    description: "This account does not exist on the selected network."
  },
  rate_limited: {
    title: "Horizon rate limited",
    description: "Horizon is temporarily rate limiting requests. Please wait a moment and try again."
  },
  request_failed: {
    title: "Could not fetch payment history",
    description: "The request did not complete. Check your connection or the Horizon endpoint status."
  }
};

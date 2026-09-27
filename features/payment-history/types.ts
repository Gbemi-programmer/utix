export type PaymentType =
  | "create_account"
  | "payment"
  | "path_payment_strict_send"
  | "path_payment_strict_receive";

export type PaymentDirection = "incoming" | "outgoing";

export interface NormalizedPayment {
  id: string;
  type: PaymentType;
  typeLabel: string;
  direction: PaymentDirection;
  counterparty: string;
  asset: string;
  amount: string;
  transactionHash: string;
  createdAt: string;
}

export interface PaymentHistoryPage {
  payments: NormalizedPayment[];
  prevCursor: string | null;
  nextCursor: string | null;
  accountId: string;
}

export interface PaymentHistoryInput {
  accountId: string;
  cursor?: string;
}

export type PaymentHistoryErrorCode =
  | "empty_input"
  | "invalid_address"
  | "account_not_found"
  | "rate_limited"
  | "request_failed";

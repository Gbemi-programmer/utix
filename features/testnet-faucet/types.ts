export interface FaucetInput {
  accountId: string;
}

export interface FaucetSuccess {
  accountId: string;
  /** Hash of the transaction Friendbot submitted, when it reports one. */
  transactionHash?: string;
  ledger?: number;
}

export type FaucetErrorCode =
  | "empty_input"
  | "invalid_address"
  | "already_funded"
  | "rate_limited"
  | "friendbot_unavailable"
  | "timeout"
  | "request_failed";

export interface FaucetErrorDetail {
  /** Wait Friendbot asked for through `Retry-After`, in milliseconds. */
  retryAfterMs?: number;
}

/** An automatic retry scheduled after a rate-limited attempt. */
export interface FaucetRetry {
  /** The attempt that will run once the delay elapses (2-based). */
  attempt: number;
  maxAttempts: number;
  delayMs: number;
}

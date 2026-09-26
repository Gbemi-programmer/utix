import { RETRY_POLICY } from "@/features/testnet-faucet/lib/backoff";
import type { FaucetErrorCode, FaucetRetry } from "@/features/testnet-faucet/types";

export const copy = {
  formLabel: "Testnet account address",
  formHint:
    "Paste the public address to fund. Never paste a secret key — funding only needs the public address.",
  submit: "Fund this account",
  loading: "Asking Friendbot...",
  emptyTitle: "No account funded yet",
  emptyDescription:
    "Friendbot creates and funds accounts on Stellar testnet only. Nothing here touches mainnet or real value.",
  successTitle: "Account funded on testnet",
  resultTitle: "Funding result",
  viewOnExplorer: "View on stellar.expert",
  mainnetWarning:
    "Friendbot is testnet-only. Switching the network in the header does not change what this tool does.",
  waitingTitle: "Friendbot is rate limiting — retrying automatically",
  waitingDescription: ({ attempt, maxAttempts, delayMs }: FaucetRetry) =>
    `Attempt ${attempt} of ${maxAttempts} starts in about ${Math.ceil(delayMs / 1_000)} s. ` +
    "There is no need to press the button again; extra requests only extend the limit.",
  cancelRetry: "Stop retrying",
  retryAfter: (retryAfterMs: number) =>
    `Friendbot asked clients to wait about ${Math.ceil(retryAfterMs / 60_000)} min before the next request.`
} as const;

export const errorCopy: Record<FaucetErrorCode, { title: string; description: string }> = {
  empty_input: {
    title: "Enter an account address",
    description: "Paste the public address you want Friendbot to fund."
  },
  invalid_address: {
    title: "That is not a valid account address",
    description:
      "It must be a Stellar public address starting with G. If your value starts with S it is a secret key and must never be pasted anywhere."
  },
  already_funded: {
    title: "This account already exists on testnet",
    description:
      "Friendbot only creates accounts that do not exist yet. Check the balance in the Balance Viewer instead."
  },
  rate_limited: {
    title: "Friendbot is still rate limiting requests",
    description: `Utix tried ${RETRY_POLICY.maxAttempts} times with growing waits and then stopped, so it does not add to the load. Wait a few minutes before trying again.`
  },
  friendbot_unavailable: {
    title: "Friendbot is not responding",
    description:
      "The testnet faucet is a public service and is occasionally down or resetting. Try again shortly."
  },
  timeout: {
    title: "Friendbot did not answer in time",
    description:
      "The request may still have funded the account. Check it in the Balance Viewer before asking again."
  },
  request_failed: {
    title: "The funding request did not complete",
    description: "Friendbot refused the request. Check the address and try again."
  }
};

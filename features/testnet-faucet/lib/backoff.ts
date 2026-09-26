import { err } from "@/core/result/result";
import {
  fundTestnetAccount,
  type FaucetResult,
  type FundOptions
} from "@/features/testnet-faucet/lib/friendbot";
import type { FaucetInput, FaucetRetry } from "@/features/testnet-faucet/types";

export interface RetryPolicy {
  /** Total attempts, including the first one. */
  maxAttempts: number;
  baseDelayMs: number;
  /** Ceiling for any single wait, including one requested by `Retry-After`. */
  maxDelayMs: number;
}

export const RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000
};

/**
 * Delay before retry number `retry` (0-based), or `null` to stop retrying.
 *
 * Uses "full jitter": a uniform draw between zero and an exponentially growing
 * ceiling, so clients that were limited at the same moment spread out instead
 * of retrying in lockstep. A `Retry-After` from the server is a floor, never
 * shortened; one longer than `maxDelayMs` ends the retries so the user is told
 * to come back later instead of watching a very long silent wait.
 */
export function backoffDelay(
  retry: number,
  retryAfterMs: number | undefined,
  random: () => number,
  policy: RetryPolicy = RETRY_POLICY
): number | null {
  if (retryAfterMs !== undefined && retryAfterMs > policy.maxDelayMs) return null;

  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** retry);
  return Math.max(Math.floor(random() * ceiling), retryAfterMs ?? 0);
}

/** Resolves after `ms`, or immediately once `signal` aborts. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();

    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

export interface BackoffOptions extends FundOptions {
  policy?: RetryPolicy;
  /** Called before each wait so the UI can say what is happening. */
  onRetry?: (retry: FaucetRetry) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

/**
 * Funds an account, retrying **only** rate-limited attempts.
 *
 * Every other outcome is final on the first answer: an already-funded account
 * or a bad address will never change by asking again, and a timeout may
 * already have funded the account, so repeating it blindly would mislead.
 * Runs at most `maxAttempts` requests; time is O(maxAttempts), space O(1).
 */
export async function fundWithBackoff(
  input: FaucetInput,
  {
    policy = RETRY_POLICY,
    onRetry,
    sleep = abortableSleep,
    random = Math.random,
    ...fundOptions
  }: BackoffOptions = {}
): Promise<FaucetResult> {
  const { signal } = fundOptions;

  for (let attempt = 1; ; attempt += 1) {
    const result = await fundTestnetAccount(input, fundOptions);
    if (result.ok || result.code !== "rate_limited" || attempt >= policy.maxAttempts) {
      return result;
    }

    const delayMs = backoffDelay(attempt - 1, result.detail?.retryAfterMs, random, policy);
    if (delayMs === null) return result;

    onRetry?.({ attempt: attempt + 1, maxAttempts: policy.maxAttempts, delayMs });
    await sleep(delayMs, signal);
    if (signal?.aborted) return err("request_failed");
  }
}

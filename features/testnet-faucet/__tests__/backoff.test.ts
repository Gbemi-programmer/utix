import { describe, expect, it, vi } from "vitest";
import { withMswHandlers, http, HttpResponse } from "@/core/testing/msw";
import {
  RETRY_POLICY,
  abortableSleep,
  backoffDelay,
  fundWithBackoff
} from "@/features/testnet-faucet/lib/backoff";
import { handlers, retryAfterHandler } from "@/features/testnet-faucet/msw/handlers";
import {
  friendbotSuccess,
  fundedAccountId,
  newAccountId,
  rateLimitedAccountId,
  timedOutAccountId,
  upstreamErrorAccountId
} from "@/features/testnet-faucet/fixtures/testnetFaucet.fixture";
import type { FaucetRetry } from "@/features/testnet-faucet/types";

const server = withMswHandlers(...handlers);

/** Records every wait instead of sleeping, so no test depends on real time. */
function recordingSleep() {
  const waits: number[] = [];
  const sleep = vi.fn(async (ms: number) => {
    waits.push(ms);
  });
  return { waits, sleep };
}

function countRequests() {
  let count = 0;
  server.events.on("request:start", () => {
    count += 1;
  });
  return () => count;
}

describe("backoffDelay", () => {
  it("doubles the jitter ceiling each retry up to the cap", () => {
    const top = () => 0.999_999;
    expect([0, 1, 2, 3, 4, 5, 6].map((retry) => backoffDelay(retry, undefined, top))).toEqual([
      999, 1_999, 3_999, 7_999, 15_999, 29_999, 29_999
    ]);
  });

  it("draws uniformly below the ceiling (full jitter)", () => {
    expect(backoffDelay(2, undefined, () => 0)).toBe(0);
    expect(backoffDelay(2, undefined, () => 0.5)).toBe(2_000);
  });

  it("never waits less than Retry-After asks", () => {
    expect(backoffDelay(0, 5_000, () => 0.5)).toBe(5_000);
  });

  it("stops retrying when Retry-After exceeds the per-wait cap", () => {
    expect(backoffDelay(0, RETRY_POLICY.maxDelayMs + 1, () => 0.5)).toBeNull();
  });
});

describe("fundWithBackoff", () => {
  it("retries a rate limit with growing waits and stops at the attempt cap", async () => {
    const requests = countRequests();
    const { waits, sleep } = recordingSleep();
    const retries: FaucetRetry[] = [];

    const result = await fundWithBackoff(
      { accountId: rateLimitedAccountId },
      { sleep, random: () => 0.5, onRetry: (retry) => retries.push(retry) }
    );

    expect(result).toEqual({ ok: false, code: "rate_limited" });
    expect(requests()).toBe(RETRY_POLICY.maxAttempts);
    expect(waits).toEqual([500, 1_000, 2_000]);
    expect(retries.map((retry) => retry.attempt)).toEqual([2, 3, 4]);
    expect(retries.every((retry) => retry.maxAttempts === RETRY_POLICY.maxAttempts)).toBe(true);
  });

  it("succeeds once the limit lifts", async () => {
    let calls = 0;
    server.use(
      http.get("https://friendbot.stellar.org", () =>
        ++calls === 1
          ? new HttpResponse("rate limited", { status: 429 })
          : HttpResponse.json(friendbotSuccess)
      )
    );
    const { waits, sleep } = recordingSleep();

    const result = await fundWithBackoff({ accountId: newAccountId }, { sleep, random: () => 0 });

    expect(result.ok).toBe(true);
    expect(waits).toEqual([0]);
  });

  it.each([
    [fundedAccountId, "already_funded"],
    [timedOutAccountId, "timeout"],
    [upstreamErrorAccountId, "friendbot_unavailable"]
  ])("never retries %s (%s)", async (accountId, code) => {
    const requests = countRequests();
    const { sleep } = recordingSleep();

    expect(await fundWithBackoff({ accountId }, { sleep })).toEqual({ ok: false, code });
    expect(requests()).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("honours Retry-After, and gives up at once when it is longer than the cap", async () => {
    server.use(retryAfterHandler(60));
    const requests = countRequests();
    const { sleep } = recordingSleep();

    const result = await fundWithBackoff({ accountId: newAccountId }, { sleep });

    expect(result).toEqual({ ok: false, code: "rate_limited", detail: { retryAfterMs: 60_000 } });
    expect(requests()).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops without another request when cancelled during a wait", async () => {
    const controller = new AbortController();
    const requests = countRequests();

    const result = await fundWithBackoff(
      { accountId: rateLimitedAccountId },
      {
        signal: controller.signal,
        sleep: async () => controller.abort()
      }
    );

    expect(result).toEqual({ ok: false, code: "request_failed" });
    expect(requests()).toBe(1);
  });
});

describe("abortableSleep", () => {
  it("resolves after the delay on fake timers", async () => {
    vi.useFakeTimers();
    const resolved = vi.fn();
    void abortableSleep(1_000).then(resolved);

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("resolves early when the signal aborts", async () => {
    const controller = new AbortController();
    const sleeping = abortableSleep(60_000, controller.signal);
    controller.abort();
    await expect(sleeping).resolves.toBeUndefined();
  });
});

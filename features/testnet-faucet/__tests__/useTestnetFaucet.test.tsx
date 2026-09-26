import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { withMswHandlers } from "@/core/testing/msw";
import { useTestnetFaucet } from "@/features/testnet-faucet/hooks/useTestnetFaucet";
import { handlers } from "@/features/testnet-faucet/msw/handlers";
import { RETRY_POLICY } from "@/features/testnet-faucet/lib/backoff";
import {
  fundedAccountId,
  newAccountId,
  rateLimitedAccountId,
  secretSeed
} from "@/features/testnet-faucet/fixtures/testnetFaucet.fixture";

withMswHandlers(...handlers);

describe("useTestnetFaucet", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts idle", () => {
    const { result } = renderHook(() => useTestnetFaucet());
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("reports a successful funding", async () => {
    const { result } = renderHook(() => useTestnetFaucet());

    await act(async () => {
      await result.current.submit(newAccountId);
    });

    await waitFor(() => expect(result.current.state.status).toBe("success"));
  });

  it("reports an account that already exists", async () => {
    const { result } = renderHook(() => useTestnetFaucet());

    await act(async () => {
      await result.current.submit(fundedAccountId);
    });

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: "error",
        code: "already_funded",
        retryAfterMs: undefined
      })
    );
  });

  it("reports the rate limit once the retry cap is hit", async () => {
    // A zero jitter draw keeps every wait at 0 ms; the timing itself is
    // covered deterministically in backoff.test.ts.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { result } = renderHook(() => useTestnetFaucet());

    await act(async () => {
      await result.current.submit(rateLimitedAccountId);
    });

    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: "error",
        code: "rate_limited",
        retryAfterMs: undefined
      })
    );
  });

  it("returns to idle when retrying is cancelled", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { result } = renderHook(() => useTestnetFaucet());

    act(() => {
      void result.current.submit(rateLimitedAccountId);
    });

    await waitFor(() => expect(result.current.state.status).toBe("waiting"));
    expect(result.current.state).toEqual({
      status: "waiting",
      retry: { attempt: 2, maxAttempts: RETRY_POLICY.maxAttempts, delayMs: 500 }
    });

    act(() => result.current.reset());
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("rejects a secret seed before any request", async () => {
    const { result } = renderHook(() => useTestnetFaucet());

    await act(async () => {
      await result.current.submit(secretSeed);
    });

    expect(result.current.state).toEqual({ status: "error", code: "invalid_address" });
  });

  it("clears state on reset", async () => {
    const { result } = renderHook(() => useTestnetFaucet());

    await act(async () => {
      await result.current.submit(newAccountId);
    });
    await waitFor(() => expect(result.current.state.status).toBe("success"));

    act(() => result.current.reset());
    expect(result.current.state).toEqual({ status: "idle" });
  });
});

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { resetHorizonClients } from "@/core/horizon/client";
import { NetworkProvider } from "@/core/network/NetworkProvider";
import { withMswHandlers } from "@/core/testing/msw";
import { testIssuerA, rateLimitedIssuer } from "@/features/path-payment-finder/fixtures/pathPaymentFinder.fixture";
import { usePathPaymentFinder } from "@/features/path-payment-finder/hooks/usePathPaymentFinder";
import { handlers } from "@/features/path-payment-finder/msw/handlers";

withMswHandlers(...handlers);

function wrapper({ children }: { children: React.ReactNode }) {
  return <NetworkProvider initialNetwork="testnet">{children}</NetworkProvider>;
}

describe("usePathPaymentFinder hook", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => usePathPaymentFinder(), { wrapper });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("handles successful strict-send lookup", async () => {
    resetHorizonClients();
    const { result } = renderHook(() => usePathPaymentFinder(), { wrapper });

    await act(async () => {
      await result.current.run({
        mode: "strict-send",
        sourceCode: "XLM",
        destCode: "USDC",
        destIssuer: testIssuerA,
        amount: "100"
      });
    });

    expect(result.current.status).toBe("success");
    expect(result.current.result?.routes).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("handles rate limited error", async () => {
    resetHorizonClients();
    const { result } = renderHook(() => usePathPaymentFinder(), { wrapper });

    await act(async () => {
      await result.current.run({
        mode: "strict-send",
        sourceCode: "XLM",
        destCode: "USDC",
        destIssuer: rateLimitedIssuer,
        amount: "100"
      });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("rate_limited");
    expect(result.current.result).toBeNull();
  });

  it("resets back to idle state", async () => {
    resetHorizonClients();
    const { result } = renderHook(() => usePathPaymentFinder(), { wrapper });

    await act(async () => {
      await result.current.run({
        mode: "strict-send",
        sourceCode: "XLM",
        destCode: "USDC",
        destIssuer: testIssuerA,
        amount: "100"
      });
    });

    expect(result.current.status).toBe("success");

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
  });
});

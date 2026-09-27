import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NetworkProvider } from "@/core/network/NetworkProvider";
import { withMswHandlers } from "@/core/testing/msw";
import { resetHorizonClients } from "@/core/horizon/client";
import { usePaymentHistory } from "@/features/payment-history/hooks/usePaymentHistory";
import { handlers } from "@/features/payment-history/msw/handlers";
import {
  missingAccount,
  queriedAccount
} from "@/features/payment-history/fixtures/paymentHistory.fixture";

withMswHandlers(...handlers);

function wrapper({ children }: { children: React.ReactNode }) {
  return <NetworkProvider initialNetwork="testnet">{children}</NetworkProvider>;
}

describe("usePaymentHistory", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => usePaymentHistory(), { wrapper });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("loads payment history for a valid account", async () => {
    resetHorizonClients();
    const { result } = renderHook(() => usePaymentHistory(), { wrapper });

    await act(async () => {
      await result.current.submit(queriedAccount);
    });

    await waitFor(() => expect(result.current.state.status).toBe("success"));
    if (result.current.state.status === "success") {
      expect(result.current.state.page.payments).toHaveLength(4);
    }
  });

  it("rejects an invalid address without a request", async () => {
    const { result } = renderHook(() => usePaymentHistory(), { wrapper });

    await act(async () => {
      await result.current.submit("not-an-address");
    });

    expect(result.current.state).toEqual({ status: "error", code: "invalid_address" });
  });

  it("reports account_not_found when account does not exist", async () => {
    resetHorizonClients();
    const { result } = renderHook(() => usePaymentHistory(), { wrapper });

    await act(async () => {
      await result.current.submit(missingAccount);
    });

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "error", code: "account_not_found" })
    );
  });

  it("clears state on reset", async () => {
    resetHorizonClients();
    const { result } = renderHook(() => usePaymentHistory(), { wrapper });

    await act(async () => {
      await result.current.submit(queriedAccount);
    });
    await waitFor(() => expect(result.current.state.status).toBe("success"));

    act(() => result.current.reset());
    expect(result.current.state).toEqual({ status: "idle" });
  });
});

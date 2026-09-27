import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NetworkProvider } from "@/core/network/NetworkProvider";
import { withMswHandlers } from "@/core/testing/msw";
import { useContractEvents } from "@/features/contract-events/hooks/useContractEvents";
import { handlers } from "@/features/contract-events/msw/handlers";
import {
  contractId,
  expiredContractId,
  secretKey
} from "@/features/contract-events/fixtures/contractEvents.fixture";

withMswHandlers(...handlers);

function wrapper({ children }: { children: React.ReactNode }) {
  return <NetworkProvider initialNetwork="testnet">{children}</NetworkProvider>;
}

const raw = (contract: string, startLedger = "") => ({ contractId: contract, startLedger, endLedger: "" });

describe("useContractEvents", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useContractEvents(), { wrapper });
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("loads events", async () => {
    const { result } = renderHook(() => useContractEvents(), { wrapper });

    await act(async () => {
      await result.current.submit(raw(contractId));
    });

    await waitFor(() => expect(result.current.state.status).toBe("success"));
  });

  it("rejects a secret key without a request and never holds it in state", async () => {
    const { result } = renderHook(() => useContractEvents(), { wrapper });

    await act(async () => {
      await result.current.submit(raw(secretKey));
    });

    expect(result.current.state).toEqual({ status: "error", code: "secret_key" });
    expect(JSON.stringify(result.current.state)).not.toContain(secretKey);
  });

  it("reports a range outside the RPC's retention window", async () => {
    const { result } = renderHook(() => useContractEvents(), { wrapper });

    await act(async () => {
      await result.current.submit(raw(expiredContractId, "1"));
    });

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "error", code: "ledger_out_of_range" })
    );
  });

  it("clears state on reset", async () => {
    const { result } = renderHook(() => useContractEvents(), { wrapper });

    await act(async () => {
      await result.current.submit(raw(contractId));
    });
    await waitFor(() => expect(result.current.state.status).toBe("success"));

    act(() => result.current.reset());
    expect(result.current.state).toEqual({ status: "idle" });
  });
});

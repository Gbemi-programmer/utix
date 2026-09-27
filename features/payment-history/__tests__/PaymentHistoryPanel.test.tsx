import { describe, expect, it } from "vitest";
import { screen } from "@/core/testing/render";
import { renderFeatureSlice } from "@/core/testing/contract";
import { withMswHandlers } from "@/core/testing/msw";
import { resetHorizonClients } from "@/core/horizon/client";
import { PaymentHistoryPanel } from "@/features/payment-history/components/PaymentHistoryPanel";
import { copy, errorCopy } from "@/features/payment-history/copy";
import { handlers, pendingHandler } from "@/features/payment-history/msw/handlers";
import {
  emptyAccount,
  missingAccount,
  queriedAccount
} from "@/features/payment-history/fixtures/paymentHistory.fixture";

const server = withMswHandlers(...handlers);

function render() {
  return renderFeatureSlice("payment-history", <PaymentHistoryPanel />);
}

async function fetchFor(slice: ReturnType<typeof render>, address: string) {
  await slice.user.type(screen.getByLabelText(copy.formLabel), address);
  await slice.user.click(screen.getByRole("button", { name: copy.submit }));
}

describe("PaymentHistoryPanel", () => {
  it("shows the empty state first", () => {
    const slice = render();
    slice.expectEmptyState();
    expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
  });

  it("shows loading state while request is in flight", async () => {
    server.use(pendingHandler);
    const slice = render();
    await fetchFor(slice, queriedAccount);
    await slice.waitForState("loading");
    slice.expectLoadingState();
  });

  it("renders payment records on success", async () => {
    resetHorizonClients();
    const slice = render();
    await fetchFor(slice, queriedAccount);

    expect(await screen.findByText(copy.resultTitle)).toBeInTheDocument();

    expect(screen.getByText("Create Account")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
    expect(screen.getByText("Path Payment (Strict Send)")).toBeInTheDocument();
    expect(screen.getByText("Path Payment (Strict Receive)")).toBeInTheDocument();
    expect(screen.getByText("25.0000000")).toBeInTheDocument();
    expect(screen.getByText("100.5000000")).toBeInTheDocument();
  });

  it("distinguishes account with no payments from error state", async () => {
    resetHorizonClients();
    const slice = render();
    await fetchFor(slice, emptyAccount);

    expect(await screen.findByText(copy.noPaymentsTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.noPaymentsDescription)).toBeInTheDocument();
  });

  it("shows error state when account does not exist (404)", async () => {
    resetHorizonClients();
    const slice = render();
    await fetchFor(slice, missingAccount);

    expect(await screen.findByText(errorCopy.account_not_found.title)).toBeInTheDocument();
    slice.expectErrorState();
  });

  it("shows error state on invalid address", async () => {
    const slice = render();
    await fetchFor(slice, "GBADADDRESS");

    expect(await screen.findByText(errorCopy.invalid_address.title)).toBeInTheDocument();
    slice.expectErrorState();
  });
});

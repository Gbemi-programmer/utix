import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { resetHorizonClients } from "@/core/horizon/client";
import { renderFeatureSlice } from "@/core/testing/contract";
import { copy } from "@/features/path-payment-finder/copy";
import {
  rateLimitedIssuer,
  testIssuerA
} from "@/features/path-payment-finder/fixtures/pathPaymentFinder.fixture";
import { pendingHandler, handlers } from "@/features/path-payment-finder/msw/handlers";
import { withMswHandlers } from "@/core/testing/msw";
import { PathPaymentFinderPanel } from "@/features/path-payment-finder/components/PathPaymentFinderPanel";

const server = withMswHandlers(...handlers);

function render() {
  return renderFeatureSlice("path-payment-finder", <PathPaymentFinderPanel />);
}

describe("PathPaymentFinderPanel", () => {
  it("shows the empty state first", () => {
    const slice = render();
    slice.expectEmptyState();
    expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
  });

  it("shows loading state while request is in flight", async () => {
    server.use(pendingHandler);
    const user = userEvent.setup();
    const slice = render();

    const issuerInput = screen.getAllByPlaceholderText("G...")[1];
    await user.type(issuerInput, testIssuerA);

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    await slice.waitForState("loading");
    slice.expectLoadingState();
  });

  it("renders routes on success", async () => {
    resetHorizonClients();
    const user = userEvent.setup();
    const slice = render();

    const issuerInput = screen.getAllByPlaceholderText("G...")[1];
    await user.type(issuerInput, testIssuerA);

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    expect(await screen.findByText(copy.resultTitle)).toBeInTheDocument();
    expect(screen.getByText("Direct (0 hops)")).toBeInTheDocument();
    expect(screen.getByText("1 hop")).toBeInTheDocument();
    expect(screen.getByText("EURT")).toBeInTheDocument();
  });

  it("distinguishes no routes from error state", async () => {
    resetHorizonClients();
    const user = userEvent.setup();
    const slice = render();

    const issuerInput = screen.getAllByPlaceholderText("G...")[1];
    await user.type(issuerInput, testIssuerA);

    const amountInput = screen.getByLabelText(new RegExp(copy.amountLabel, "i"));
    await user.clear(amountInput);
    await user.type(amountInput, "999");

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    expect(await screen.findByText(copy.noRoutesTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.noRoutesDescription)).toBeInTheDocument();
  });

  it("shows error state when rate limited", async () => {
    resetHorizonClients();
    const user = userEvent.setup();
    const slice = render();

    const issuerInput = screen.getAllByPlaceholderText("G...")[1];
    await user.clear(issuerInput);
    await user.type(issuerInput, rateLimitedIssuer);

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    await slice.waitForState("error");
    slice.expectErrorState();
    expect(screen.getByText(copy.errors.rate_limited)).toBeInTheDocument();
  });

  it("shows error state on invalid input", async () => {
    resetHorizonClients();
    const user = userEvent.setup();
    const slice = render();

    const amountInput = screen.getByLabelText(new RegExp(copy.amountLabel, "i"));
    await user.clear(amountInput);
    await user.type(amountInput, "invalid");

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    await slice.waitForState("error");
    slice.expectErrorState();
  });
});

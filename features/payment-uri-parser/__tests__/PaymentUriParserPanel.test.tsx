import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderFeatureSlice } from "@/core/testing/contract";
import { copy } from "@/features/payment-uri-parser/copy";
import {
  secretKeyUri,
  validPayUri,
  validTxUri
} from "@/features/payment-uri-parser/fixtures/paymentUriParser.fixture";
import { PaymentUriParserPanel } from "@/features/payment-uri-parser/components/PaymentUriParserPanel";

function render() {
  return renderFeatureSlice("payment-uri-parser", <PaymentUriParserPanel />);
}

describe("PaymentUriParserPanel", () => {
  it("shows the empty state first", () => {
    const slice = render();
    slice.expectEmptyState();
    expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
  });

  it("shows loading state while parsing", async () => {
    const user = userEvent.setup();
    const slice = render();

    const input = screen.getByLabelText(new RegExp(copy.formLabel, "i"));
    await user.type(input, validPayUri);

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    await slice.waitForState("loading");
    slice.expectLoadingState();
  });

  it("renders parsed pay parameters on success", async () => {
    const user = userEvent.setup();
    const slice = render();

    const input = screen.getByLabelText(new RegExp(copy.formLabel, "i"));
    await user.type(input, validPayUri);

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    expect(await screen.findByText(copy.resultTitle)).toBeInTheDocument();
    expect(screen.getByText("Payment Request (pay)")).toBeInTheDocument();
    expect(screen.getByText("Destination Account")).toBeInTheDocument();
    expect(screen.getByText("Payment Amount")).toBeInTheDocument();
  });

  it("renders parsed tx parameters on success", async () => {
    const user = userEvent.setup();
    const slice = render();

    const input = screen.getByLabelText(new RegExp(copy.formLabel, "i"));
    await user.type(input, validTxUri);

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    expect(await screen.findByText(copy.resultTitle)).toBeInTheDocument();
    expect(screen.getByText("Transaction Envelope (tx)")).toBeInTheDocument();
    expect(screen.getByText("Transaction Envelope XDR")).toBeInTheDocument();
  });

  it("shows error state on invalid scheme", async () => {
    const user = userEvent.setup();
    const slice = render();

    const input = screen.getByLabelText(new RegExp(copy.formLabel, "i"));
    await user.type(input, "https://stellar.org");

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    await slice.waitForState("error");
    slice.expectErrorState();
    expect(screen.getByText(copy.errors.invalid_scheme)).toBeInTheDocument();
  });

  it("shows error state on secret key detection", async () => {
    const user = userEvent.setup();
    const slice = render();

    const input = screen.getByLabelText(new RegExp(copy.formLabel, "i"));
    await user.type(input, secretKeyUri);

    const submitBtn = screen.getByRole("button", { name: copy.submit });
    await user.click(submitBtn);

    await slice.waitForState("error");
    slice.expectErrorState();
    expect(screen.getByText(copy.errors.secret_key_detected)).toBeInTheDocument();
  });
});

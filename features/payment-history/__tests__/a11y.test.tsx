import { describe, it } from "vitest";
import { renderFeature, screen } from "@/core/testing/render";
import { expectNoAxeViolations } from "@/core/testing/axe";
import { withMswHandlers } from "@/core/testing/msw";
import { resetHorizonClients } from "@/core/horizon/client";
import { PaymentHistoryPanel } from "@/features/payment-history/components/PaymentHistoryPanel";
import { copy } from "@/features/payment-history/copy";
import { handlers } from "@/features/payment-history/msw/handlers";
import { queriedAccount } from "@/features/payment-history/fixtures/paymentHistory.fixture";

withMswHandlers(...handlers);

describe("PaymentHistoryPanel accessibility", () => {
  it("has no WCAG A/AA violations in its initial state", async () => {
    const { container } = renderFeature(<PaymentHistoryPanel />);
    await expectNoAxeViolations(container);
  });

  it("has no WCAG A/AA violations with payment history loaded", async () => {
    resetHorizonClients();
    const { container, user } = renderFeature(<PaymentHistoryPanel />);

    await user.type(screen.getByLabelText(copy.formLabel), queriedAccount);
    await user.click(screen.getByRole("button", { name: copy.submit }));
    await screen.findByText(copy.resultTitle);

    await expectNoAxeViolations(container);
  });
});

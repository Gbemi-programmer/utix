import { describe, it } from "vitest";
import { renderFeature, screen } from "@/core/testing/render";
import { expectNoAxeViolations } from "@/core/testing/axe";
import { withMswHandlers } from "@/core/testing/msw";
import { resetHorizonClients } from "@/core/horizon/client";
import { PathPaymentFinderPanel } from "@/features/path-payment-finder/components/PathPaymentFinderPanel";
import { copy } from "@/features/path-payment-finder/copy";
import { handlers } from "@/features/path-payment-finder/msw/handlers";
import { testIssuerA } from "@/features/path-payment-finder/fixtures/pathPaymentFinder.fixture";

withMswHandlers(...handlers);

describe("PathPaymentFinderPanel accessibility", () => {
  it("has no WCAG A/AA violations in its initial state", async () => {
    const { container } = renderFeature(<PathPaymentFinderPanel />);
    await expectNoAxeViolations(container);
  });

  it("has no WCAG A/AA violations with route results loaded", async () => {
    resetHorizonClients();
    const { container, user } = renderFeature(<PathPaymentFinderPanel />);

    const issuerInput = screen.getAllByPlaceholderText("G...")[1];
    await user.type(issuerInput, testIssuerA);

    await user.click(screen.getByRole("button", { name: copy.submit }));
    await screen.findByText(copy.resultTitle);

    await expectNoAxeViolations(container);
  });
});

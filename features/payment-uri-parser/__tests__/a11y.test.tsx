import { describe, it } from "vitest";
import { renderFeature, screen } from "@/core/testing/render";
import { expectNoAxeViolations } from "@/core/testing/axe";
import { PaymentUriParserPanel } from "@/features/payment-uri-parser/components/PaymentUriParserPanel";
import { copy } from "@/features/payment-uri-parser/copy";
import { validPayUri } from "@/features/payment-uri-parser/fixtures/paymentUriParser.fixture";

describe("PaymentUriParserPanel accessibility", () => {
  it("has no WCAG A/AA violations in its initial state", async () => {
    const { container } = renderFeature(<PaymentUriParserPanel />);
    await expectNoAxeViolations(container);
  });

  it("has no WCAG A/AA violations with parsed result loaded", async () => {
    const { container, user } = renderFeature(<PaymentUriParserPanel />);

    const input = screen.getByLabelText(new RegExp(copy.formLabel, "i"));
    await user.type(input, validPayUri);

    await user.click(screen.getByRole("button", { name: copy.submit }));
    await screen.findByText(copy.resultTitle);

    await expectNoAxeViolations(container);
  });
});

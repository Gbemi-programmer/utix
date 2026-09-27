import { describe, it } from "vitest";
import { renderFeature, screen } from "@/core/testing/render";
import { expectNoAxeViolations } from "@/core/testing/axe";
import { withMswHandlers } from "@/core/testing/msw";
import { ContractEventsPanel } from "@/features/contract-events/components/ContractEventsPanel";
import { copy, errorCopy } from "@/features/contract-events/copy";
import { handlers } from "@/features/contract-events/msw/handlers";
import { contractId } from "@/features/contract-events/fixtures/contractEvents.fixture";

withMswHandlers(...handlers);

describe("ContractEventsPanel accessibility", () => {
  it("has no WCAG A/AA violations in its initial state", async () => {
    const { container } = renderFeature(<ContractEventsPanel />);
    await expectNoAxeViolations(container);
  });

  it("has no WCAG A/AA violations with decoded events", async () => {
    const { container, user } = renderFeature(<ContractEventsPanel />);

    await user.type(screen.getByLabelText(copy.contractLabel), contractId);
    await user.click(screen.getByRole("button", { name: copy.submit }));
    await screen.findAllByText("transfer");

    await expectNoAxeViolations(container);
  });

  it("has no WCAG A/AA violations with an error", async () => {
    const { container, user } = renderFeature(<ContractEventsPanel />);

    await user.click(screen.getByRole("button", { name: copy.submit }));
    await screen.findByText(errorCopy.empty_contract_id.title);

    await expectNoAxeViolations(container);
  });
});

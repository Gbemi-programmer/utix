import { describe, expect, it } from "vitest";
import { screen } from "@/core/testing/render";
import { renderFeatureSlice } from "@/core/testing/contract";
import { withMswHandlers } from "@/core/testing/msw";
import { ContractEventsPanel } from "@/features/contract-events/components/ContractEventsPanel";
import { copy, errorCopy } from "@/features/contract-events/copy";
import { handlers, pendingHandler } from "@/features/contract-events/msw/handlers";
import {
  accountAddress,
  busyContractId,
  contractId,
  fromAccount,
  quietContractId,
  secretKey,
  transferAmount
} from "@/features/contract-events/fixtures/contractEvents.fixture";

const server = withMswHandlers(...handlers);

function render() {
  return renderFeatureSlice("contract-events", <ContractEventsPanel />);
}

async function fetchFor(slice: ReturnType<typeof render>, contract: string, startLedger = "") {
  await slice.user.type(screen.getByLabelText(copy.contractLabel), contract);
  if (startLedger) await slice.user.type(screen.getByLabelText(copy.startLabel), startLedger);
  await slice.user.click(screen.getByRole("button", { name: copy.submit }));
}

describe("ContractEventsPanel", () => {
  it("shows the empty state first", () => {
    const slice = render();
    slice.expectEmptyState();
    expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
  });

  it("shows the loading state while the request is in flight", async () => {
    server.use(pendingHandler);
    const slice = render();
    await fetchFor(slice, contractId);
    await slice.waitForState("loading");
    slice.expectLoadingState();
  });

  it("renders decoded topics and values for each event", async () => {
    const slice = render();
    await fetchFor(slice, contractId);

    // The name heads the event and also appears as its first decoded topic.
    expect(await screen.findAllByText("transfer")).toHaveLength(2);
    expect(screen.getByText(transferAmount)).toBeInTheDocument();
    expect(screen.getByText(fromAccount)).toBeInTheDocument();
    expect(screen.getByText("{amount: 5, memo: 0xdead}")).toBeInTheDocument();
    expect(screen.getByText(copy.failedCall)).toBeInTheDocument();
    expect(screen.getAllByText(copy.undecoded)).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("says so when the contract emitted nothing", async () => {
    const slice = render();
    await fetchFor(slice, quietContractId, "1");
    expect(await screen.findByText(copy.noEvents)).toBeInTheDocument();
  });

  it("warns when the page cap cut the results short", async () => {
    const slice = render();
    await fetchFor(slice, busyContractId, "1");
    expect(await screen.findByText(copy.truncated, {}, { timeout: 15_000 })).toBeInTheDocument();
  }, 30_000);

  it("explains that an account address is not a contract", async () => {
    const slice = render();
    await fetchFor(slice, accountAddress);
    slice.expectErrorState();
    expect(screen.getByText(errorCopy.account_address.title)).toBeInTheDocument();
  });

  it("rejects a secret key and never renders it", async () => {
    const slice = render();
    await fetchFor(slice, secretKey);

    await slice.waitForState("error");
    expect(screen.getByText(errorCopy.secret_key.title)).toBeInTheDocument();
    // Only the controlled input holds it; no rendered text echoes it back.
    expect(slice.container.textContent).not.toContain(secretKey);
  });

  it("reports an invalid ledger range", async () => {
    const slice = render();
    await slice.user.type(screen.getByLabelText(copy.contractLabel), contractId);
    await slice.user.type(screen.getByLabelText(copy.startLabel), "200");
    await slice.user.type(screen.getByLabelText(copy.endLabel), "100");
    await slice.user.click(screen.getByRole("button", { name: copy.submit }));

    await slice.waitForState("error");
    expect(screen.getByText(errorCopy.invalid_range.title)).toBeInTheDocument();
  });
});

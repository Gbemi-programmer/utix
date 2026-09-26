export function formatAmount(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}
import { formatAmount } from "@/core/format/amount";
import { formatDateTime } from "@/core/format/date";
import type { ClaimableBalanceSummary } from "@/features/claimable-balances/types";

export { formatAmount, formatDateTime as formatTimestamp };

export function formatBalanceHeading(balance: ClaimableBalanceSummary): string {
  return `${formatAmount(balance.amount)} ${balance.asset.label}`;
}

export function formatClaimantStatus(claimableNow: boolean): string {
  return claimableNow ? "Claimable now" : "Not claimable now";
}

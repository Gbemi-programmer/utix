import { formatInteger } from "@/core/format/amount";

export { amountToStroops, formatAmount, stroopsToAmount } from "@/core/format/amount";

/** Groups stroops for display in the user's locale without converting through Number. */
export function formatStroops(value: string): string {
  return `${formatInteger(BigInt(value))} stroops`;
}

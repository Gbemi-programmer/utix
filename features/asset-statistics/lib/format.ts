import {
  amountToStroops as signedAmountToStroops,
  formatAmount as formatLocaleAmount,
  stroopsToAmount
} from "@/core/format/amount";

export { formatInteger } from "@/core/format/amount";

/** Parses a non-negative Stellar amount without passing through Number. */
export function amountToStroops(value: string): bigint | null {
  const stroops = signedAmountToStroops(value);
  return stroops !== null && stroops >= 0n ? stroops : null;
}

export function normalizeAmount(value: string): string | null {
  const stroops = amountToStroops(value);
  return stroops === null ? null : stroopsToAmount(stroops);
}

export function sumAmounts(values: string[]): string | null {
  let total = 0n;
  for (const value of values) {
    const stroops = amountToStroops(value);
    if (stroops === null) return null;
    total += stroops;
  }
  return stroopsToAmount(total);
}

/** Groups the whole part while deliberately preserving all seven decimals. */
export function formatAmount(value: string): string {
  return formatLocaleAmount(value, { trimZeros: false });
}

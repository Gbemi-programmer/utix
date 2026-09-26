import { formatAmount as formatLocaleAmount, formatInteger } from "@/core/format/amount";

export { stroopsToAmount } from "@/core/format/amount";

/** Formats an XLM amount in the user's locale without converting it to a Number. */
export function formatAmount(value: string): string {
  return `${formatLocaleAmount(value)} XLM`;
}

export function formatLedger(sequence: number): string {
  return formatInteger(sequence);
}

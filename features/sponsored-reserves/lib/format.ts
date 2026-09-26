import { formatAmount } from "@/core/format/amount";
import type {
  SponsoredEntry,
  SponsoredEntryKind
} from "@/features/sponsored-reserves/types";

/** Formats stroops as XLM exactly, in the user's locale, without converting through Number. */
export function formatStroops(stroops: string, showPositiveSign = false): string {
  return formatAmount(BigInt(stroops), { signed: showPositiveSign });
}

export function formatEntryReference(entry: SponsoredEntry): string {
  return entry.kind === "offer" ? `#${entry.reference}` : entry.reference;
}

export interface SponsoredEntrySummary {
  kind: SponsoredEntryKind;
  count: number;
}

/** Counts listed sponsored entries in the same stable order as the table. */
export function summarizeSponsoredEntries(
  entries: readonly SponsoredEntry[]
): SponsoredEntrySummary[] {
  const counts: Record<SponsoredEntryKind, number> = {
    account: 0,
    trustline: 0,
    signer: 0,
    offer: 0,
    data: 0
  };

  for (const entry of entries) counts[entry.kind] += 1;

  return (Object.keys(counts) as SponsoredEntryKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => ({ kind, count: counts[kind] }));
}

export function reserveEffectDirection(stroops: string): "relief" | "burden" | "neutral" {
  const value = BigInt(stroops);
  if (value > 0n) return "relief";
  if (value < 0n) return "burden";
  return "neutral";
}

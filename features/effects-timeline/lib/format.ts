import { formatAmount } from "@/core/format/amount";
import { truncateMiddle } from "@/core/lib/strings";
import { copy } from "@/features/effects-timeline/copy";

export { formatAmount };
export { formatDateTime as formatTimestamp } from "@/core/format/date";

/** Renders the asset of an effect from Horizon's split `asset_*` fields. */
export function formatAsset(
  assetType?: string,
  assetCode?: string,
  assetIssuer?: string
): string {
  if (assetType === "native") return copy.nativeAsset;
  if (!assetCode) return copy.unknownAsset;
  return assetIssuer ? `${assetCode} · ${truncateMiddle(assetIssuer, 4)}` : assetCode;
}

/** Renders the canonical `CODE:ISSUER` form used by claimable balances. */
export function formatCanonicalAsset(asset?: string): string {
  if (!asset) return copy.unknownAsset;
  if (asset === "native") return copy.nativeAsset;

  const [code, issuer] = asset.split(":");
  return formatAsset(undefined, code, issuer);
}

export function formatAmountWithAsset(amount: string, asset: string): string {
  return `${formatAmount(amount)} ${asset}`;
}

/** Snake-cased Horizon effect types read as sentences, with a few overrides. */
export function formatEffectType(type: string): string {
  const override = copy.effectTypeLabels[type];
  if (override) return override;

  const words = type.replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : type;
}

/** Middle-truncates addresses, pool ids and claimable balance ids. */
export function formatIdentifier(value: string): string {
  return truncateMiddle(value, 6);
}

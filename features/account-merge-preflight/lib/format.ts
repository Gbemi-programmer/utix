import { amountToStroops as signedAmountToStroops } from "@/core/format/amount";

export { stroopsToAmount } from "@/core/format/amount";

/** A balance as Horizon writes it: non-negative, no leading zeros, at most seven decimals. */
export function amountToStroops(amount: string): bigint | null {
  if (/^0\d/.test(amount)) return null;
  const stroops = signedAmountToStroops(amount);
  return stroops !== null && stroops >= 0n ? stroops : null;
}

export function formatAsset(asset: { asset_type: string; asset_code?: string; asset_issuer?: string }): string {
  if (asset.asset_type === "native") return "XLM";
  if (asset.asset_code && asset.asset_issuer) return `${asset.asset_code}:${asset.asset_issuer}`;
  return asset.asset_type.replace(/_/g, " ");
}

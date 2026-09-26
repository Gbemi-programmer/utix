import { amountToStroops, formatAmount } from "@/core/format/amount";
import type { DisplayBalance } from "@/features/balance-viewer/types";

export { formatAmount };

export function formatAssetLabel(balance: DisplayBalance): string {
  if (balance.kind === "native") return "XLM (native)";
  if (balance.kind === "liquidity_pool") return "Liquidity pool shares";
  return balance.assetCode;
}

/** Case-insensitive match against asset code, issuer, or native XLM. */
export function balanceMatchesFilter(balance: DisplayBalance, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  if (balance.kind === "native") {
    return "xlm".includes(normalized) || normalized.includes("xlm") || "native".includes(normalized);
  }

  const code = balance.assetCode.toLowerCase();
  const issuer = balance.issuer?.toLowerCase() ?? "";
  return code.includes(normalized) || issuer.includes(normalized);
}

/** Returns the sum of both liability sides, or null when neither is present. */
export function totalLiabilities(balance: DisplayBalance): string | null {
  const selling = balance.sellingLiabilities;
  const buying = balance.buyingLiabilities;
  if (!selling && !buying) return null;

  const total = (amountToStroops(selling ?? "0") ?? 0n) + (amountToStroops(buying ?? "0") ?? 0n);
  return formatAmount(total);
}

import type { PaymentAsset } from "@/features/payment-qr/types";

export { formatAmount } from "@/core/format/amount";

export function formatAsset(asset: PaymentAsset): string {
  return asset.kind === "native" ? "XLM (native)" : `${asset.code}:${asset.issuer}`;
}

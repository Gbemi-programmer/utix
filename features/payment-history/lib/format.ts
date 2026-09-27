import { formatDateTime } from "@/core/format/date";
import type { PaymentDirection, PaymentType } from "@/features/payment-history/types";

export function formatTimestamp(isoString: string): string {
  if (!isoString) return "—";
  return formatDateTime(isoString);
}

export function formatShortAddress(address: string): string {
  if (!address || address === "—") return "—";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function getDirectionBadgeClass(direction: PaymentDirection): string {
  return direction === "incoming"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-sky-50 text-sky-700 border-sky-200";
}

export function formatTypeLabel(type: PaymentType): string {
  const labels: Record<PaymentType, string> = {
    create_account: "Create Account",
    payment: "Payment",
    path_payment_strict_send: "Path Send",
    path_payment_strict_receive: "Path Receive"
  };
  return labels[type] || type;
}

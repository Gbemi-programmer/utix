import { formatAmount } from "@/core/format/amount";
import { formatDateTime } from "@/core/format/date";
import { copy } from "../copy";
import type { LedgerLookupResult } from "../types";
export function formatValue(value: string | number | null): string { return value === null ? copy.unavailable : String(value); }
/** Timestamps and XLM totals get locale formatting; every other field is shown exactly as read. */
export function formatField(key: keyof LedgerLookupResult, value: string | number | null): string {
 if (value === null) return copy.unavailable;
 if (key === "closedAt" || key === "observedAt") return formatDateTime(String(value));
 if (key === "feePool" || key === "totalCoins") return formatAmount(String(value));
 return String(value);
}
export function formatAge(closedAt: string, observedAt: string): string {
 const seconds = Math.floor((Date.parse(observedAt)-Date.parse(closedAt))/1000);
 return !Number.isFinite(seconds) ? copy.unavailable : seconds < 0 ? copy.afterObservation : copy.secondsAgo(seconds);
}

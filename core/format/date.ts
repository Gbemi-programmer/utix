import type { Locales } from "@/core/format/amount";

/**
 * Formats ledger and request timestamps for display.
 *
 * The user's locale decides the *shape* (day/month order, 12/24-hour clock,
 * month names), but the time zone is fixed to UTC and always printed: ledger
 * close times, time bounds and Horizon timestamps are compared against each
 * other and against explorers, which all speak UTC.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormat(locales: Locales): Intl.DateTimeFormat {
  const key = locales === undefined ? "" : [locales].flat().join(",");
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locales as string | string[] | undefined, {
      dateStyle: "medium",
      timeStyle: "long",
      timeZone: "UTC"
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Accepts an ISO-8601 string, epoch milliseconds or a `Date`. An unparseable
 * string is returned unchanged rather than rendered as "Invalid Date".
 */
export function formatDateTime(value: string | number | Date, locale?: Locales): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return dateTimeFormat(locale).format(date);
}

/** Formats a Unix timestamp in seconds, as used by transaction time bounds. */
export function formatUnixSeconds(seconds: bigint | string | number, locale?: Locales): string {
  const ms = BigInt(seconds) * 1_000n;
  // Past ±8.64e15 ms (the ECMAScript Date range) a time bound cannot be a date.
  if (ms > 8_640_000_000_000_000n || ms < -8_640_000_000_000_000n) return String(seconds);
  return formatDateTime(Number(ms), locale);
}

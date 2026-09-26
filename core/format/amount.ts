import { err, ok, type Result } from "@/core/result/result";

/**
 * The one module that reads and writes Stellar amounts.
 *
 * An amount is an int64 count of stroops shown with exactly seven decimal
 * places. Nothing here passes through `Number`: `Intl.NumberFormat` rounds to
 * three fraction digits by default and, on engines without string-decimal
 * support, turns a string into a double first — either way digits are lost.
 * So only the whole part is handed to `Intl` (as a `BigInt`, which it formats
 * exactly everywhere), and the fraction digits are appended through the
 * locale's own decimal separator and digit shapes.
 */

export const AMOUNT_DECIMALS = 7;
export const STROOPS_PER_UNIT = 10_000_000n;
export const INT64_MAX = 9_223_372_036_854_775_807n;
export const INT64_MIN = -9_223_372_036_854_775_808n;

export type Locales = string | readonly string[] | undefined;

/**
 * The only accepted input shape: ASCII digits, an optional leading `-`, and an
 * optional `.` followed by at least one digit. `.` is always the decimal
 * separator, whatever the user's locale.
 */
const CANONICAL_AMOUNT = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Characters that act as a thousands separator somewhere (`,` `'` `’` `_`,
 * spaces including the no-break and narrow no-break spaces). `1,234` is 1234
 * in en-US and 1.234 in de-DE, so it is rejected rather than guessed at.
 */
const GROUPING_CHARACTERS = /[,'’_\s  ]/;

export type AmountParseError =
  | "empty"
  | "grouping_separator"
  | "invalid_format"
  | "too_many_decimals"
  | "negative"
  | "out_of_range";

export interface ParseAmountOptions {
  allowNegative?: boolean;
}

/**
 * Parses user input into stroops. Time and space are O(n) in the input length.
 *
 * The grammar is fixed and locale-independent — see `CANONICAL_AMOUNT` — so the
 * same keystrokes mean the same amount for every user.
 */
export function parseAmount(
  raw: string,
  { allowNegative = false }: ParseAmountOptions = {}
): Result<bigint, AmountParseError> {
  const value = raw.trim();
  if (!value) return err("empty");
  if (GROUPING_CHARACTERS.test(value)) return err("grouping_separator");

  const match = CANONICAL_AMOUNT.exec(value);
  if (!match) return err("invalid_format");

  const [, sign, whole, fraction = ""] = match;
  if (fraction.length > AMOUNT_DECIMALS) return err("too_many_decimals");
  if (sign && !allowNegative) return err("negative");

  const magnitude = BigInt(whole) * STROOPS_PER_UNIT + BigInt(fraction.padEnd(AMOUNT_DECIMALS, "0"));
  const stroops = sign ? -magnitude : magnitude;
  if (stroops > INT64_MAX || stroops < INT64_MIN) return err("out_of_range");

  return ok(stroops);
}

/**
 * Converts an amount string as Horizon writes it (`"12.5000000"`) to stroops,
 * without the int64 range check — totals of many amounts may exceed it.
 * Returns null when the value is not an amount.
 */
export function amountToStroops(value: string): bigint | null {
  const match = CANONICAL_AMOUNT.exec(value);
  if (!match || (match[3] ?? "").length > AMOUNT_DECIMALS) return null;

  const [, sign, whole, fraction = ""] = match;
  const magnitude = BigInt(whole) * STROOPS_PER_UNIT + BigInt(fraction.padEnd(AMOUNT_DECIMALS, "0"));
  return sign ? -magnitude : magnitude;
}

/** Canonical seven-decimal form, e.g. `12.5000000` — the form Horizon uses. */
export function stroopsToAmount(stroops: bigint): string {
  const magnitude = stroops < 0n ? -stroops : stroops;
  const fraction = (magnitude % STROOPS_PER_UNIT).toString().padStart(AMOUNT_DECIMALS, "0");
  return `${stroops < 0n ? "-" : ""}${magnitude / STROOPS_PER_UNIT}.${fraction}`;
}

interface LocaleSymbols {
  integer: Intl.NumberFormat;
  decimal: string;
  /** The locale's digit shapes, indexed by digit value. */
  digits: readonly string[];
  /** What the locale writes before and after a negative number. */
  negativePrefix: string;
  negativeSuffix: string;
}

const symbolsCache = new Map<string, LocaleSymbols>();

function localeSymbols(locales: Locales): LocaleSymbols {
  const key = locales === undefined ? "" : [locales].flat().join(",");
  const cached = symbolsCache.get(key);
  if (cached) return cached;

  const requested = locales as string | string[] | undefined;
  const integer = new Intl.NumberFormat(requested, { maximumFractionDigits: 0 });
  const parts = new Intl.NumberFormat(requested, { minimumFractionDigits: 1 }).formatToParts(-1);
  const integerIndex = parts.findIndex((part) => part.type === "integer");
  const fractionIndex = parts.findIndex((part) => part.type === "fraction");

  const symbols: LocaleSymbols = {
    integer,
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    digits: Array.from({ length: 10 }, (_, digit) => integer.format(digit)),
    negativePrefix: parts.slice(0, integerIndex).map((part) => part.value).join(""),
    negativeSuffix: parts.slice(fractionIndex + 1).map((part) => part.value).join("")
  };
  symbolsCache.set(key, symbols);
  return symbols;
}

export interface FormatAmountOptions {
  /** BCP 47 locale(s); defaults to the user's locale. */
  locale?: Locales;
  /** Drop trailing zeros (`12.5`) instead of showing all seven (`12.5000000`). */
  trimZeros?: boolean;
  /** Prefix a positive value with `+`, for deltas. */
  signed?: boolean;
}

/**
 * Formats an amount string (or a stroop `BigInt`) for display in the user's
 * locale with every significant digit kept. A string that is not an amount is
 * returned unchanged: a bad value from upstream is worth showing verbatim.
 * O(n) in the number of digits; locale symbols are built once per locale.
 */
export function formatAmount(
  value: string | bigint,
  { locale, trimZeros = true, signed = false }: FormatAmountOptions = {}
): string {
  const stroops = typeof value === "bigint" ? value : amountToStroops(value);
  if (stroops === null) return value as string;

  const symbols = localeSymbols(locale);
  const magnitude = stroops < 0n ? -stroops : stroops;
  let fraction = (magnitude % STROOPS_PER_UNIT).toString().padStart(AMOUNT_DECIMALS, "0");
  if (trimZeros) fraction = fraction.replace(/0+$/, "");

  const localizedFraction = fraction.replace(/\d/g, (digit) => symbols.digits[Number(digit)]);
  const body =
    symbols.integer.format(magnitude / STROOPS_PER_UNIT) +
    (localizedFraction ? `${symbols.decimal}${localizedFraction}` : "");

  if (stroops < 0n) return `${symbols.negativePrefix}${body}${symbols.negativeSuffix}`;
  return signed && stroops > 0n ? `+${body}` : body;
}

/** Locale-grouped integer (stroops, ledger sequences, counts). Exact for BigInt. */
export function formatInteger(value: bigint | number, locale?: Locales): string {
  return localeSymbols(locale).integer.format(value);
}

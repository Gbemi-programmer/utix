import { describe, expect, it } from "vitest";
import {
  INT64_MAX,
  amountToStroops,
  formatAmount,
  formatInteger,
  parseAmount,
  stroopsToAmount
} from "@/core/format/amount";

const NNBSP = " ";
const MAX_AMOUNT = "922337203685.4775807";

describe("parseAmount", () => {
  it("reads the canonical period-decimal form into exact stroops", () => {
    expect(parseAmount("12.5")).toEqual({ ok: true, value: 125_000_000n });
    expect(parseAmount(" 0.0000001 ")).toEqual({ ok: true, value: 1n });
    expect(parseAmount(MAX_AMOUNT)).toEqual({ ok: true, value: INT64_MAX });
  });

  it.each(["1,5", "1,234.5", "1.234,5", "1 234", `1${NNBSP}234`, "1'234", "1_000"])(
    "refuses to guess what the separator in %j means",
    (raw) => {
      expect(parseAmount(raw)).toEqual({ ok: false, code: "grouping_separator" });
    }
  );

  it.each(["1e3", ".5", "5.", "0x10", "+1", "١٢", "Infinity", "1.2.3"])(
    "rejects the non-canonical form %j",
    (raw) => {
      expect(parseAmount(raw)).toEqual({ ok: false, code: "invalid_format" });
    }
  );

  it("rejects an eighth decimal instead of rounding it away", () => {
    expect(parseAmount("1.00000001")).toEqual({ ok: false, code: "too_many_decimals" });
  });

  it("rejects amounts outside int64 and negatives unless allowed", () => {
    expect(parseAmount("922337203685.4775808")).toEqual({ ok: false, code: "out_of_range" });
    expect(parseAmount("-1")).toEqual({ ok: false, code: "negative" });
    expect(parseAmount("-1", { allowNegative: true })).toEqual({ ok: true, value: -10_000_000n });
    expect(parseAmount("   ")).toEqual({ ok: false, code: "empty" });
  });
});

describe("amountToStroops / stroopsToAmount", () => {
  it("round-trips without a range limit, so totals may exceed int64", () => {
    const beyond = INT64_MAX * 3n;
    expect(amountToStroops(stroopsToAmount(beyond))).toBe(beyond);
    expect(stroopsToAmount(-5n)).toBe("-0.0000005");
    expect(amountToStroops("not an amount")).toBeNull();
  });
});

describe("formatAmount", () => {
  it.each([
    ["en-US", "922,337,203,685.4775807"],
    ["de-DE", "922.337.203.685,4775807"],
    ["fr-FR", `922${NNBSP}337${NNBSP}203${NNBSP}685,4775807`],
    ["hi-IN", "9,22,33,72,03,685.4775807"],
    ["ar-EG", "٩٢٢٬٣٣٧٬٢٠٣٬٦٨٥٫٤٧٧٥٨٠٧"]
  ])("keeps all seven decimals of the int64 maximum in %s", (locale, expected) => {
    expect(formatAmount(MAX_AMOUNT, { locale })).toBe(expected);
  });

  it("uses the locale's decimal comma rather than a period", () => {
    expect(formatAmount("1234.5000000", { locale: "de-DE" })).toBe("1.234,5");
    expect(formatAmount("0.0000001", { locale: "fr-FR" })).toBe("0,0000001");
  });

  it("trims trailing zeros only on request", () => {
    expect(formatAmount("10.5000000", { locale: "en-US" })).toBe("10.5");
    expect(formatAmount("10.0000000", { locale: "en-US" })).toBe("10");
    expect(formatAmount("10.5", { locale: "de-DE", trimZeros: false })).toBe("10,5000000");
  });

  it("formats stroop BigInts and signs negatives the locale's way", () => {
    expect(formatAmount(-12_345_678_900_000n, { locale: "en-US" })).toBe("-1,234,567.89");
    expect(formatAmount("-0.5", { locale: "de-DE" })).toBe("-0,5");
    expect(formatAmount("-1", { locale: "ar-EG" })).toBe("؜-١");
  });

  it("marks a positive delta with + when signed", () => {
    expect(formatAmount("2.5", { locale: "en-US", signed: true })).toBe("+2.5");
    expect(formatAmount("0", { locale: "en-US", signed: true })).toBe("0");
  });

  it("returns a value that is not an amount unchanged", () => {
    expect(formatAmount("n/a", { locale: "en-US" })).toBe("n/a");
    expect(formatAmount("1.00000001", { locale: "en-US" })).toBe("1.00000001");
  });
});

describe("formatInteger", () => {
  it("groups exactly for BigInt beyond the safe integer range", () => {
    expect(formatInteger(INT64_MAX, "en-US")).toBe("9,223,372,036,854,775,807");
    expect(formatInteger(1017700, "de-DE")).toBe("1.017.700");
  });
});

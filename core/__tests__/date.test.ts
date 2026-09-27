import { describe, expect, it } from "vitest";
import { formatDateTime, formatUnixSeconds } from "@/core/format/date";

const ISO = "2024-03-05T14:07:09Z";

describe("formatDateTime", () => {
  it.each([
    ["en-US", "Mar 5, 2024, 2:07:09 PM UTC"],
    ["de-DE", "05.03.2024, 14:07:09 UTC"],
    ["fr-FR", "5 mars 2024, 14:07:09 UTC"],
    ["ja-JP", "2024/03/05 14:07:09 UTC"]
  ])("uses the %s shape but always states UTC", (locale, expected) => {
    expect(formatDateTime(ISO, locale)).toBe(expected);
  });

  it("accepts epoch milliseconds and Date objects", () => {
    const ms = Date.parse(ISO);
    expect(formatDateTime(ms, "en-US")).toBe(formatDateTime(new Date(ms), "en-US"));
  });

  it("returns an unparseable value unchanged", () => {
    expect(formatDateTime("not a date", "en-US")).toBe("not a date");
  });
});

describe("formatUnixSeconds", () => {
  it("formats a time bound given in seconds", () => {
    expect(formatUnixSeconds("1709647629", "en-US")).toBe("Mar 5, 2024, 2:07:09 PM UTC");
  });

  it("leaves a uint64 bound outside the Date range as the raw number", () => {
    expect(formatUnixSeconds("18446744073709551615", "en-US")).toBe("18446744073709551615");
  });
});

describe("formatDateTime edge cases", () => {
  it("returns invalid timestamps unchanged", () => {
    expect(formatDateTime("not-a-date", "en-US")).toBe("not-a-date");
    expect(formatDateTime(Number.NaN, "en-US")).toBe("NaN");
    expect(formatDateTime(new Date("x"), "en-US")).toBe("Invalid Date");
  });

  it("always formats in UTC regardless of locale", () => {
    expect(formatDateTime("2024-01-01T00:30:00Z", "en-US")).toContain("UTC");
    expect(formatDateTime("2024-01-01T00:30:00Z", "ar-EG")).toContain("٢٠٢٤");
  });

  it("falls back to the default locale for a malformed tag", () => {
    expect(formatDateTime("2024-01-01T00:00:00Z", "@@bad")).toBe(formatDateTime("2024-01-01T00:00:00Z"));
  });
});

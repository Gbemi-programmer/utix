import { describe, expect, it } from "vitest";
import {
  formatAssetDisplay,
  formatEffectiveRate,
  formatHopBreadcrumbs
} from "@/features/path-payment-finder/lib/format";
import { testIssuerA, testIssuerB } from "@/features/path-payment-finder/fixtures/pathPaymentFinder.fixture";

describe("PathPaymentFinder format helpers", () => {
  it("formats asset display correctly", () => {
    expect(formatAssetDisplay("XLM")).toBe("XLM");
    expect(formatAssetDisplay("native")).toBe("XLM");
    expect(formatAssetDisplay("USDC", testIssuerA)).toContain("USDC");
    expect(formatAssetDisplay("USDC", testIssuerA)).toContain("…");
  });

  it("calculates effective rates", () => {
    expect(formatEffectiveRate("100", "12.5")).toBe("0.1250");
    expect(formatEffectiveRate("10", "15")).toBe("1.5000");
    expect(formatEffectiveRate("0", "15")).toBe("—");
    expect(formatEffectiveRate("invalid", "15")).toBe("—");
  });

  it("formats hop breadcrumbs", () => {
    expect(formatHopBreadcrumbs([])).toBe("Direct");
    expect(
      formatHopBreadcrumbs([
        { code: "EURT", issuer: testIssuerB, type: "credit_alphanum4" }
      ])
    ).toBe("EURT");
    expect(
      formatHopBreadcrumbs([
        { code: "EURT", issuer: testIssuerB, type: "credit_alphanum4" },
        { code: "XLM", type: "native" }
      ])
    ).toBe("EURT → XLM");
  });
});

import { describe, expect, it } from "vitest";
import { testIssuerA, testIssuerB } from "@/features/path-payment-finder/fixtures/pathPaymentFinder.fixture";
import { validatePathPaymentFinderInput } from "@/features/path-payment-finder/schema";

describe("validatePathPaymentFinderInput", () => {
  it("accepts valid strict-send input with XLM and issued asset", () => {
    const res = validatePathPaymentFinderInput({
      mode: "strict-send",
      sourceCode: "XLM",
      destCode: "USDC",
      destIssuer: testIssuerA,
      amount: "100"
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.mode).toBe("strict-send");
      expect(res.value.sourceCode).toBe("XLM");
      expect(res.value.sourceIssuer).toBeUndefined();
      expect(res.value.destCode).toBe("USDC");
      expect(res.value.destIssuer).toBe(testIssuerA);
      expect(res.value.amount).toBe("100");
    }
  });

  it("accepts valid strict-receive input between two issued assets", () => {
    const res = validatePathPaymentFinderInput({
      mode: "strict-receive",
      sourceCode: "EURT",
      sourceIssuer: testIssuerB,
      destCode: "USDC",
      destIssuer: testIssuerA,
      amount: "25.5"
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.mode).toBe("strict-receive");
      expect(res.value.sourceCode).toBe("EURT");
      expect(res.value.sourceIssuer).toBe(testIssuerB);
      expect(res.value.amount).toBe("25.5");
    }
  });

  it("rejects non-positive amounts or invalid formats", () => {
    expect(
      validatePathPaymentFinderInput({
        mode: "strict-send",
        sourceCode: "XLM",
        destCode: "USDC",
        destIssuer: testIssuerA,
        amount: "0"
      }).ok
    ).toBe(false);

    expect(
      validatePathPaymentFinderInput({
        mode: "strict-send",
        sourceCode: "XLM",
        destCode: "USDC",
        destIssuer: testIssuerA,
        amount: "-50"
      }).ok
    ).toBe(false);

    expect(
      validatePathPaymentFinderInput({
        mode: "strict-send",
        sourceCode: "XLM",
        destCode: "USDC",
        destIssuer: testIssuerA,
        amount: "abc"
      }).ok
    ).toBe(false);
  });

  it("rejects identical source and destination assets", () => {
    const res = validatePathPaymentFinderInput({
      mode: "strict-send",
      sourceCode: "XLM",
      destCode: "XLM",
      amount: "10"
    });
    expect(res.ok).toBe(false);
  });

  it("rejects invalid or missing issuer for issued asset", () => {
    const res = validatePathPaymentFinderInput({
      mode: "strict-send",
      sourceCode: "XLM",
      destCode: "USDC",
      destIssuer: "invalid-issuer",
      amount: "10"
    });
    expect(res.ok).toBe(false);
  });

  it("never accepts secret keys as issuer or codes", () => {
    const secret = "SB6V53J232IWB32U64WTYZ57ZGB25RFZ3Y45C5AYU5A7DNHFGL2L76K6";
    const res = validatePathPaymentFinderInput({
      mode: "strict-send",
      sourceCode: "XLM",
      destCode: "USDC",
      destIssuer: secret,
      amount: "10"
    });
    expect(res.ok).toBe(false);
  });
});

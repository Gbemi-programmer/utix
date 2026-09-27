import { describe, expect, it } from "vitest";
import {
  secretKeyUri,
  validPayUri,
  validTxUri
} from "@/features/payment-uri-parser/fixtures/paymentUriParser.fixture";
import { validatePaymentUriInput } from "@/features/payment-uri-parser/schema";

describe("validatePaymentUriInput", () => {
  it("accepts valid web+stellar:pay URI", () => {
    const res = validatePaymentUriInput(validPayUri);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.uri).toBe(validPayUri);
    }
  });

  it("accepts valid web+stellar:tx URI", () => {
    const res = validatePaymentUriInput(validTxUri);
    expect(res.ok).toBe(true);
  });

  it("rejects empty input", () => {
    const res = validatePaymentUriInput("");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("empty_input");
    }
  });

  it("rejects wrong scheme", () => {
    const res = validatePaymentUriInput("https://stellar.org");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("invalid_scheme");
    }
  });

  it("rejects unknown operations", () => {
    const res = validatePaymentUriInput("web+stellar:invalid?foo=bar");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("unknown_operation");
    }
  });

  it("rejects inputs containing secret keys", () => {
    const res = validatePaymentUriInput(secretKeyUri);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("secret_key_detected");
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  invalidPayUri,
  unknownParamUri,
  validPayUri,
  validTxUri
} from "@/features/payment-uri-parser/fixtures/paymentUriParser.fixture";
import { parseSep7Uri } from "@/features/payment-uri-parser/lib/paymentUriParser";

describe("paymentUriParser library", () => {
  it("parses and validates a complete web+stellar:pay URI", () => {
    const res = parseSep7Uri({ uri: validPayUri });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.operation).toBe("pay");
      expect(res.value.isValid).toBe(true);
      expect(res.value.errors).toHaveLength(0);
      expect(res.value.parameters.length).toBeGreaterThanOrEqual(8);

      const destParam = res.value.parameters.find((p) => p.key === "destination");
      expect(destParam?.status).toBe("valid");

      const amountParam = res.value.parameters.find((p) => p.key === "amount");
      expect(amountParam?.value).toBe("100.5");
      expect(amountParam?.status).toBe("valid");
    }
  });

  it("parses and validates a web+stellar:tx URI", () => {
    const res = parseSep7Uri({ uri: validTxUri });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.operation).toBe("tx");
      expect(res.value.isValid).toBe(true);
      const xdrParam = res.value.parameters.find((p) => p.key === "xdr");
      expect(xdrParam?.status).toBe("valid");
    }
  });

  it("detects validation errors in invalid pay URI", () => {
    const res = parseSep7Uri({ uri: invalidPayUri });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.isValid).toBe(false);
      expect(res.value.errors.length).toBeGreaterThan(0);

      const destParam = res.value.parameters.find((p) => p.key === "destination");
      expect(destParam?.status).toBe("error");

      const amountParam = res.value.parameters.find((p) => p.key === "amount");
      expect(amountParam?.status).toBe("error");
    }
  });

  it("flags unknown query parameters as warnings", () => {
    const res = parseSep7Uri({ uri: unknownParamUri });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.warnings.length).toBeGreaterThan(0);
      const customParam = res.value.parameters.find((p) => p.key === "custom_tracking_id");
      expect(customParam?.status).toBe("warning");
    }
  });
});

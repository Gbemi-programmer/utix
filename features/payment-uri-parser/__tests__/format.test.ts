import { describe, expect, it } from "vitest";
import {
  formatParamLabel,
  getParamStatusBadgeClass,
  truncateDisplayValue
} from "@/features/payment-uri-parser/lib/format";

describe("PaymentUriParser format helpers", () => {
  it("returns human-friendly parameter labels", () => {
    expect(formatParamLabel("destination")).toBe("Destination Account");
    expect(formatParamLabel("amount")).toBe("Payment Amount");
    expect(formatParamLabel("xdr")).toBe("Transaction Envelope XDR");
    expect(formatParamLabel("custom_field")).toBe("custom_field");
  });

  it("returns badge styles for each status", () => {
    expect(getParamStatusBadgeClass("valid")).toContain("emerald");
    expect(getParamStatusBadgeClass("warning")).toContain("amber");
    expect(getParamStatusBadgeClass("error")).toContain("rose");
    expect(getParamStatusBadgeClass("info")).toContain("slate");
  });

  it("truncates long values with ellipsis", () => {
    expect(truncateDisplayValue("")).toBe("—");
    expect(truncateDisplayValue("short")).toBe("short");
    expect(truncateDisplayValue("a".repeat(100), 20)).toContain("…");
    expect(truncateDisplayValue("a".repeat(100), 20).length).toBeLessThan(30);
  });
});

import { describe, expect, it } from "vitest";
import {
  formatShortAddress,
  formatTimestamp,
  formatTypeLabel,
  getDirectionBadgeClass
} from "@/features/payment-history/lib/format";

describe("PaymentHistory format helpers", () => {
  it("formats short address", () => {
    expect(formatShortAddress("")).toBe("—");
    expect(formatShortAddress("—")).toBe("—");
    expect(formatShortAddress("GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H")).toBe(
      "GAAQCA…AQDZ7H"
    );
  });

  it("formats timestamp", () => {
    expect(formatTimestamp("")).toBe("—");
    expect(formatTimestamp("2026-05-01T12:00:00Z")).toContain("2026");
  });

  it("returns direction badge class", () => {
    expect(getDirectionBadgeClass("incoming")).toContain("emerald");
    expect(getDirectionBadgeClass("outgoing")).toContain("sky");
  });

  it("formats type label", () => {
    expect(formatTypeLabel("create_account")).toBe("Create Account");
    expect(formatTypeLabel("payment")).toBe("Payment");
    expect(formatTypeLabel("path_payment_strict_send")).toBe("Path Send");
    expect(formatTypeLabel("path_payment_strict_receive")).toBe("Path Receive");
  });
});

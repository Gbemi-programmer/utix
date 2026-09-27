import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { parsePaymentHistoryInput } from "@/features/payment-history/schema";

describe("PaymentHistory schema", () => {
  it("rejects empty input", () => {
    const res = parsePaymentHistoryInput("");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("empty_input");
  });

  it("rejects whitespace-only input", () => {
    const res = parsePaymentHistoryInput("   \n\t  ");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("empty_input");
  });

  it("rejects invalid StrKey address", () => {
    const res = parsePaymentHistoryInput("GBADADDRESSWITHINVALIDCHECKSUM");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid_address");
  });

  it("rejects non-G address (e.g. secret key or contract)", () => {
    const secret = Keypair.random().secret();
    const res = parsePaymentHistoryInput(secret);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid_address");
  });

  it("accepts a valid Stellar G-address and strips whitespace", () => {
    const pubKey = Keypair.random().publicKey();
    const res = parsePaymentHistoryInput(`  ${pubKey}  `);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.accountId).toBe(pubKey);
  });
});

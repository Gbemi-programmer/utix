import { describe, expect, it } from "vitest";
import {
  fetchPaymentHistory,
  normalizePaymentRecord
} from "@/features/payment-history/lib/paymentHistory";
import {
  counterpartyAccount,
  emptyAccount,
  missingAccount,
  queriedAccount,
  rateLimitedAccount
} from "@/features/payment-history/fixtures/paymentHistory.fixture";
import { withMswHandlers } from "@/core/testing/msw";
import { handlers } from "@/features/payment-history/msw/handlers";

withMswHandlers(...handlers);

describe("paymentHistory library", () => {
  it("normalizes create_account correctly for funder and recipient", () => {
    const raw = {
      type: "create_account",
      id: "1",
      account: queriedAccount,
      funder: counterpartyAccount,
      starting_balance: "50.0000000",
      transaction_hash: "tx1",
      created_at: "2026-05-01T12:00:00Z"
    };

    // Queried account was the created account -> incoming
    const inRecord = normalizePaymentRecord(raw, queriedAccount);
    expect(inRecord.direction).toBe("incoming");
    expect(inRecord.counterparty).toBe(counterpartyAccount);
    expect(inRecord.amount).toBe("50.0000000");
    expect(inRecord.asset).toBe("XLM");

    // Counterparty was funder -> outgoing
    const outRecord = normalizePaymentRecord(raw, counterpartyAccount);
    expect(outRecord.direction).toBe("outgoing");
    expect(outRecord.counterparty).toBe(queriedAccount);
  });

  it("normalizes standard payment and path payments correctly", () => {
    const paymentRaw = {
      type: "payment",
      id: "2",
      from: queriedAccount,
      to: counterpartyAccount,
      asset_type: "credit_alphanum4",
      asset_code: "USDC",
      asset_issuer: counterpartyAccount,
      amount: "10.0000000",
      transaction_hash: "tx2"
    };

    const outPayment = normalizePaymentRecord(paymentRaw, queriedAccount);
    expect(outPayment.direction).toBe("outgoing");
    expect(outPayment.counterparty).toBe(counterpartyAccount);
    expect(outPayment.asset).toBe("USDC");
    expect(outPayment.amount).toBe("10.0000000");

    const pathRaw = {
      type: "path_payment_strict_send",
      id: "3",
      from: counterpartyAccount,
      to: queriedAccount,
      asset_type: "native",
      amount: "100.0000000",
      source_asset_type: "credit_alphanum4",
      source_asset_code: "EURT",
      source_amount: "20.0000000"
    };

    const inPath = normalizePaymentRecord(pathRaw, queriedAccount);
    expect(inPath.direction).toBe("incoming");
    expect(inPath.counterparty).toBe(counterpartyAccount);
    expect(inPath.asset).toBe("XLM");
    expect(inPath.amount).toBe("100.0000000");
  });

  it("fetches payment history for an account on testnet", async () => {
    const res = await fetchPaymentHistory({ accountId: queriedAccount }, "testnet");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.payments).toHaveLength(4);
      expect(res.value.nextCursor).toBe("104");
      expect(res.value.prevCursor).toBe("101");
    }
  });

  it("returns empty payments array for account with no payments", async () => {
    const res = await fetchPaymentHistory({ accountId: emptyAccount }, "testnet");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.payments).toHaveLength(0);
    }
  });

  it("returns account_not_found error for missing account (404)", async () => {
    const res = await fetchPaymentHistory({ accountId: missingAccount }, "testnet");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("account_not_found");
    }
  });

  it("returns rate_limited error when Horizon returns 429", async () => {
    const res = await fetchPaymentHistory({ accountId: rateLimitedAccount }, "testnet");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("rate_limited");
    }
  });
});

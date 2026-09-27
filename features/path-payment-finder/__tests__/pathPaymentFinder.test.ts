import { describe, expect, it } from "vitest";
import { resetHorizonClients } from "@/core/horizon/client";
import { findPaymentPaths, normalizePaymentRoute, toStellarAsset } from "@/features/path-payment-finder/lib/pathPaymentFinder";
import {
  rateLimitedIssuer,
  testIssuerA,
  testIssuerB
} from "@/features/path-payment-finder/fixtures/pathPaymentFinder.fixture";
import { withMswHandlers } from "@/core/testing/msw";
import { handlers } from "@/features/path-payment-finder/msw/handlers";

withMswHandlers(...handlers);

describe("pathPaymentFinder library", () => {
  it("converts code and issuer to Stellar Asset", () => {
    const native = toStellarAsset("XLM");
    expect(native.isNative()).toBe(true);

    const issued = toStellarAsset("USDC", testIssuerA);
    expect(issued.isNative()).toBe(false);
    expect(issued.getCode()).toBe("USDC");
    expect(issued.getIssuer()).toBe(testIssuerA);
  });

  it("normalizes payment route records correctly", () => {
    const route = normalizePaymentRoute({
      source_asset_type: "native",
      source_amount: "100.0000000",
      destination_asset_type: "credit_alphanum4",
      destination_asset_code: "USDC",
      destination_asset_issuer: testIssuerA,
      destination_amount: "12.5000000",
      path: [
        {
          asset_type: "credit_alphanum4",
          asset_code: "EURT",
          asset_issuer: testIssuerB
        }
      ]
    });

    expect(route.sourceAsset).toBe("XLM");
    expect(route.sourceAmount).toBe("100.0000000");
    expect(route.destinationAsset).toContain("USDC");
    expect(route.destinationAmount).toBe("12.5000000");
    expect(route.hopsCount).toBe(1);
    expect(route.path[0].code).toBe("EURT");
    expect(route.effectiveRate).toBe("0.1250");
  });

  it("queries strict-send routes successfully", async () => {
    resetHorizonClients();
    const res = await findPaymentPaths(
      {
        mode: "strict-send",
        sourceCode: "XLM",
        destCode: "USDC",
        destIssuer: testIssuerA,
        amount: "100"
      },
      "testnet"
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.mode).toBe("strict-send");
      expect(res.value.routes).toHaveLength(2);
      expect(res.value.routes[0].hopsCount).toBe(0);
      expect(res.value.routes[1].hopsCount).toBe(1);
    }
  });

  it("queries strict-receive routes successfully", async () => {
    resetHorizonClients();
    const res = await findPaymentPaths(
      {
        mode: "strict-receive",
        sourceCode: "USDC",
        sourceIssuer: testIssuerA,
        destCode: "XLM",
        amount: "50"
      },
      "testnet"
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.mode).toBe("strict-receive");
      expect(res.value.routes).toHaveLength(1);
      expect(res.value.routes[0].sourceAmount).toBe("8.0000000");
      expect(res.value.routes[0].destinationAmount).toBe("50.0000000");
    }
  });

  it("returns rate_limited error when Horizon rate limit is hit", async () => {
    resetHorizonClients();
    const res = await findPaymentPaths(
      {
        mode: "strict-send",
        sourceCode: "XLM",
        destCode: "USDC",
        destIssuer: rateLimitedIssuer,
        amount: "100"
      },
      "testnet"
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("rate_limited");
    }
  });

  it("returns empty routes array when no routes exist", async () => {
    resetHorizonClients();
    const res = await findPaymentPaths(
      {
        mode: "strict-send",
        sourceCode: "XLM",
        destCode: "USDC",
        destIssuer: testIssuerA,
        amount: "999"
      },
      "testnet"
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.routes).toHaveLength(0);
    }
  });
});

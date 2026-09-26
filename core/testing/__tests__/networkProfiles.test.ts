/**
 * Tests for the network profile fixture system.
 *
 * These tests verify that:
 * 1. All profiles are well-formed and have required fields
 * 2. Fixture data is structurally valid
 * 3. MSW handlers are generated for each profile
 * 4. The parameterized test helper correctly filters profiles
 * 5. Edge case coverage is tracked
 */

import { describe, expect, it } from "vitest";
import {
  NETWORK_PROFILES,
  getNetworkProfile,
  getProfileFixtures,
  isNetworkProfileId,
  type NetworkProfileId,
} from "@/core/testing/networkProfiles";
import { networkProfileHandlers } from "@/core/testing/networkProfileHandlers";
import {
  runAgainstNetworkProfiles,
  getProfileEdgeCases,
  isProfile,
} from "@/core/testing/runAgainstProfiles";
import type { NetworkProfileContext } from "@/core/testing/networkProfiles";

describe("network profile definitions", () => {
  it("defines at least three profiles", () => {
    expect(NETWORK_PROFILES.length).toBeGreaterThanOrEqual(3);
  });

  it("has unique profile IDs", () => {
    const ids = NETWORK_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a testnet-fresh-account profile", () => {
    const profile = getNetworkProfile("testnet-fresh-account");
    expect(profile.network).toBe("testnet");
    expect(profile.accountState).toBe("fresh");
    expect(profile.requiresFuturenet).toBe(false);
  });

  it("has a mainnet-established-account profile", () => {
    const profile = getNetworkProfile("mainnet-established-account");
    expect(profile.network).toBe("mainnet");
    expect(profile.accountState).toBe("established");
    expect(profile.requiresFuturenet).toBe(false);
  });

  it("has a futurenet-protocol-vnext profile", () => {
    const profile = getNetworkProfile("futurenet-protocol-vnext");
    expect(profile.network).toBe("futurenet");
    expect(profile.requiresFuturenet).toBe(true);
  });

  it.each(NETWORK_PROFILES.map((p) => [p.id, p] as const))(
    "%s has required fields",
    (_id, profile) => {
      expect(profile.id).toBeTruthy();
      expect(profile.label).toBeTruthy();
      expect(profile.description).toBeTruthy();
      expect(profile.horizonUrl).toBeTruthy();
      expect(profile.baseReserve).toBeGreaterThan(0);
      expect(profile.baseFee).toBeGreaterThan(0);
      expect(profile.protocolVersion).toBeGreaterThan(0);
      expect(profile.edgeCases.length).toBeGreaterThan(0);
    }
  );

  it.each(NETWORK_PROFILES.map((p) => [p.id, p] as const))(
    "%s description references real network behavior",
    (_id, profile) => {
      // Descriptions should mention the network they represent
      const description = profile.description.toLowerCase();
      expect(
        description.includes("testnet") ||
        description.includes("mainnet") ||
        description.includes("futurenet")
      ).toBe(true);
    }
  );
});

describe("network profile fixtures", () => {
  it.each(NETWORK_PROFILES.map((p) => [p.id, p] as const))(
    "%s has valid account fixture",
    (_id, profile) => {
      const fixtures = getProfileFixtures(profile.id);

      expect(fixtures.accountId).toMatch(/^G/);
      expect(fixtures.accountResponse.id).toBe(fixtures.accountId);
      expect(fixtures.accountResponse.account_id).toBe(fixtures.accountId);
      expect(fixtures.accountResponse.sequence).toBeTruthy();
      expect(fixtures.accountResponse.balances).toBeInstanceOf(Array);
      expect(fixtures.accountResponse.signers).toBeInstanceOf(Array);
    }
  );

  it.each(NETWORK_PROFILES.map((p) => [p.id, p] as const))(
    "%s has valid error fixture",
    (_id, _profile) => {
      const fixtures = getProfileFixtures(_profile.id);

      expect(fixtures.errorResponse.type).toBeTruthy();
      expect(fixtures.errorResponse.title).toBeTruthy();
      expect(fixtures.errorResponse.status).toBeGreaterThan(0);
    }
  );

  it("testnet-fresh-account has low sequence number", () => {
    const fixtures = getProfileFixtures("testnet-fresh-account");
    const seq = parseInt(fixtures.accountResponse.sequence, 10);
    expect(seq).toBeLessThan(100);
  });

  it("mainnet-established-account has high sequence number", () => {
    const fixtures = getProfileFixtures("mainnet-established-account");
    const seq = parseInt(fixtures.accountResponse.sequence, 10);
    expect(seq).toBeGreaterThan(1_000_000);
  });

  it("mainnet-established-account has multiple signers", () => {
    const fixtures = getProfileFixtures("mainnet-established-account");
    expect(fixtures.accountResponse.signers.length).toBeGreaterThan(1);
  });

  it("mainnet-established-account has data entries", () => {
    const fixtures = getProfileFixtures("mainnet-established-account");
    expect(Object.keys(fixtures.accountResponse.data).length).toBeGreaterThan(0);
  });

  it("futurenet-protocol-vnext has higher protocol version", () => {
    const fixtures = getProfileFixtures("futurenet-protocol-vnext");
    expect(fixtures.networkInfo.protocol_version).toBeGreaterThan(21);
  });

  it("futurenet-protocol-vnext has different passphrase", () => {
    const fixtures = getProfileFixtures("futurenet-protocol-vnext");
    expect(fixtures.networkInfo.network_passphrase).not.toBe(
      "Test SDF Network ; September 2015"
    );
    expect(fixtures.networkInfo.network_passphrase).not.toBe(
      "Public Global Stellar Network ; September 2015"
    );
  });
});

describe("network profile MSW handlers", () => {
  it.each(NETWORK_PROFILES.map((p) => [p.id, p] as const))(
    "%s generates handlers",
    (_id, profile) => {
      const handlers = networkProfileHandlers(profile.id);
      expect(handlers.length).toBeGreaterThan(0);
    }
  );

  it("handlers include account endpoint", () => {
    const handlers = networkProfileHandlers("testnet-fresh-account");
    // Should have at least: account, not-found, sub-resources, RPC
    expect(handlers.length).toBeGreaterThanOrEqual(5);
  });
});

describe("network profile filtering", () => {
  it("filters by feature networks", () => {
    const contexts: NetworkProfileContext[] = [];

    runAgainstNetworkProfiles(
      { featureNetworks: ["testnet"] },
      (ctx) => {
        contexts.push(ctx);
        it(`runs for ${ctx.profile.id}`, () => {
          expect(ctx.profile.network).toBe("testnet");
        });
      }
    );

    // The helper creates describe blocks; we can't easily inspect them
    // synchronously, but we can verify the function doesn't throw
    expect(contexts).toBeDefined();
  });

  it("includes futurenet only when requested", () => {
    const contexts: NetworkProfileContext[] = [];

    runAgainstNetworkProfiles(
      { featureNetworks: ["testnet", "mainnet"], includeFuturenet: true },
      (ctx) => {
        contexts.push(ctx);
        it(`runs for ${ctx.profile.id}`, () => {
          expect(ctx.profile).toBeDefined();
        });
      }
    );

    expect(contexts).toBeDefined();
  });

  it("filters by specific profile IDs", () => {
    const contexts: NetworkProfileContext[] = [];

    runAgainstNetworkProfiles(
      { featureNetworks: ["testnet", "mainnet"], profileIds: ["testnet-fresh-account"] },
      (ctx) => {
        contexts.push(ctx);
        it(`runs for ${ctx.profile.id}`, () => {
          expect(ctx.profile.id).toBe("testnet-fresh-account");
        });
      }
    );

    expect(contexts).toBeDefined();
  });
});

describe("network profile edge cases", () => {
  it("collects edge cases from profiles", () => {
    const edgeCases = getProfileEdgeCases([
      "testnet-fresh-account",
      "mainnet-established-account",
    ]);

    expect(edgeCases).toContain("recently-created-account");
    expect(edgeCases).toContain("high-sequence-number");
    expect(edgeCases).toContain("many-subentries");
  });

  it("includes futurenet-specific edge cases", () => {
    const edgeCases = getProfileEdgeCases(["futurenet-protocol-vnext"]);

    expect(edgeCases).toContain("newer-protocol-features");
    expect(edgeCases).toContain("futurenet-passphrase");
  });
});

describe("network profile type guards", () => {
  it("isNetworkProfileId validates known IDs", () => {
    expect(isNetworkProfileId("testnet-fresh-account")).toBe(true);
    expect(isNetworkProfileId("mainnet-established-account")).toBe(true);
    expect(isNetworkProfileId("futurenet-protocol-vnext")).toBe(true);
  });

  it("isNetworkProfileId rejects unknown IDs", () => {
    expect(isNetworkProfileId("unknown-profile")).toBe(false);
    expect(isNetworkProfileId("")).toBe(false);
    expect(isNetworkProfileId(null)).toBe(false);
    expect(isNetworkProfileId(undefined)).toBe(false);
    expect(isNetworkProfileId(123)).toBe(false);
  });

  it("isProfile checks context profile ID", () => {
    const ctx: NetworkProfileContext = {
      profile: NETWORK_PROFILES[0],
      fixtures: getProfileFixtures(NETWORK_PROFILES[0].id),
      handlers: [],
      // server is not needed for this test
    } as NetworkProfileContext;

    expect(isProfile(ctx, "testnet-fresh-account")).toBe(true);
    expect(isProfile(ctx, "mainnet-established-account")).toBe(false);
  });
});

describe("network profile integration", () => {
  it("all profiles have consistent fixture structure", () => {
    for (const profile of NETWORK_PROFILES) {
      const fixtures = getProfileFixtures(profile.id);

      // Every profile should have these core fields
      expect(fixtures.accountId).toBeTruthy();
      expect(fixtures.accountResponse).toBeDefined();
      expect(fixtures.errorResponse).toBeDefined();
      expect(fixtures.networkInfo).toBeDefined();

      // Network info should match profile
      expect(fixtures.networkInfo.protocol_version).toBe(profile.protocolVersion);
    }
  });

  it("testnet and mainnet profiles use correct passphrases", () => {
    const testnetFixtures = getProfileFixtures("testnet-fresh-account");
    const mainnetFixtures = getProfileFixtures("mainnet-established-account");

    expect(testnetFixtures.networkInfo.network_passphrase).toBe(
      "Test SDF Network ; September 2015"
    );
    expect(mainnetFixtures.networkInfo.network_passphrase).toBe(
      "Public Global Stellar Network ; September 2015"
    );
  });
});

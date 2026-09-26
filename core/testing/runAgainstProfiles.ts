/**
 * Shared parameterized test helper for cross-network profile testing.
 *
 * This helper allows feature slice test suites to run their core assertions
 * against every applicable network profile. It handles:
 *
 * - MSW server lifecycle (setup/teardown per profile)
 * - Profile-specific fixture injection
 * - Clear test labeling with profile name and edge cases
 * - Filtering profiles by applicability (e.g. skip futurenet for testnet-only tools)
 *
 * Usage in a feature slice's test suite:
 * ```ts
 * import { runAgainstNetworkProfiles } from "@/core/testing/runAgainstProfiles";
 * import { BalanceViewerPanel } from "./components/BalanceViewerPanel";
 *
 * runAgainstNetworkProfiles(
 *   { featureNetworks: ["testnet", "mainnet"] },
 *   ({ profile, fixtures, server }) => {
 *     it(`[${profile.id}] shows the empty state first`, () => {
 *       renderFeatureSlice("balance-viewer", <BalanceViewerPanel />, {
 *         network: profile.network as StellarNetwork,
 *       });
 *       expect(screen.getByText(copy.emptyTitle)).toBeInTheDocument();
 *     });
 *
 *     it(`[${profile.id}] loads account data`, async () => {
 *       // fixtures.accountId is the profile's test account
 *       // MSW handlers are already set up via the server
 *     });
 *   }
 * );
 * ```
 */

import { describe, it, type RequestHandler } from "vitest";
import { withMswHandlers } from "@/core/testing/msw";
import type { StellarNetwork } from "@/core/network/types";
import {
  NETWORK_PROFILES,
  getProfileFixtures,
  type NetworkProfile,
  type NetworkProfileContext,
  type NetworkProfileId,
} from "@/core/testing/networkProfiles";
import { networkProfileHandlers } from "@/core/testing/networkProfileHandlers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunAgainstProfilesOptions {
  /**
   * Networks this feature slice supports. Profiles for other networks are
   * skipped. Use `["testnet", "mainnet"]` for standard slices.
   */
  featureNetworks: readonly StellarNetwork[];
  /**
   * Specific profile IDs to run. When provided, only these profiles are
   * tested (subject to the featureNetworks filter). Defaults to all
   * applicable profiles.
   */
  profileIds?: readonly NetworkProfileId[];
  /**
   * When true, futurenet profiles are included even if the feature slice
   * doesn't declare futurenet support. Use this for slices that explicitly
   * handle futurenet protocol features.
   */
  includeFuturenet?: boolean;
}

export type ProfileTestFactory = (ctx: NetworkProfileContext) => void;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Runs a test factory function against every applicable network profile.
 *
 * For each profile, this helper:
 * 1. Creates a `describe` block labeled with the profile ID and name
 * 2. Sets up MSW handlers for that profile
 * 3. Provides the profile's fixtures and context to the test factory
 *
 * The test factory receives a context object with:
 * - `profile`: The full profile definition (id, label, edgeCases, etc.)
 * - `fixtures`: Pre-built fixture data (accountResponse, errorResponse, etc.)
 * - `server`: The MSW server instance (for per-test handler overrides)
 * - `handlers`: The default MSW handlers for this profile
 *
 * @example
 * ```ts
 * runAgainstNetworkProfiles(
 *   { featureNetworks: ["testnet", "mainnet"] },
 *   ({ profile, fixtures, server }) => {
 *     it(`[${profile.id}] core assertion`, async () => {
 *       // profile.id === "testnet-fresh-account"
 *       // fixtures.accountId is the profile's test account
 *       // MSW is already set up — no need to call withMswHandlers
 *     });
 *   }
 * );
 * ```
 */
export function runAgainstNetworkProfiles(
  options: RunAgainstProfilesOptions,
  testFactory: ProfileTestFactory
): void {
  const { featureNetworks, profileIds, includeFuturenet = false } = options;

  const applicableProfiles = NETWORK_PROFILES.filter((profile) => {
    // Filter by specific profile IDs if provided
    if (profileIds && !profileIds.includes(profile.id)) {
      return false;
    }

    // Filter by network support
    if (profile.network === "futurenet") {
      return includeFuturenet;
    }

    return featureNetworks.includes(profile.network as StellarNetwork);
  });

  if (applicableProfiles.length === 0) {
    // Provide a helpful message when no profiles match
    const requestedIds = profileIds?.join(", ") ?? "all";
    const networks = featureNetworks.join(", ");
    describe("[network-profiles] No applicable profiles", () => {
      it(`warns that no profiles match the filter (requested: ${requestedIds}, networks: ${networks})`, () => {
        // This is intentionally a no-op that shows up in test output
        // to alert developers that their filter excluded all profiles
        console.warn(
          `[network-profiles] No profiles match filter. ` +
          `Requested: ${requestedIds}, feature networks: ${networks}. ` +
          `Available profiles: ${NETWORK_PROFILES.map((p) => p.id).join(", ")}`
        );
      });
    });
    return;
  }

  for (const profile of applicableProfiles) {
    const fixtures = getProfileFixtures(profile.id);
    const handlers = networkProfileHandlers(profile.id);

    describe(`[${profile.id}] ${profile.label}`, () => {
      const server = withMswHandlers(...handlers);

      // Provide profile context to the test factory
      testFactory({
        profile,
        fixtures,
        server,
        handlers,
      });
    });
  }
}

/**
 * Returns the list of edge case labels that a given set of profiles covers.
 * Useful for test documentation and ensuring coverage of specific edge cases.
 */
export function getProfileEdgeCases(
  profileIds: readonly NetworkProfileId[]
): string[] {
  const edgeCases = new Set<string>();
  for (const id of profileIds) {
    const profile = NETWORK_PROFILES.find((p) => p.id === id);
    if (profile) {
      profile.edgeCases.forEach((ec) => edgeCases.add(ec));
    }
  }
  return Array.from(edgeCases).sort();
}

/**
 * Type guard to check if a profile context is for a specific profile ID.
 * Useful when a test factory needs to branch on the profile.
 *
 * @example
 * ```ts
 * if (isProfile(ctx, "testnet-fresh-account")) {
 *   // Testnet-specific assertion
 * }
 * ```
 */
export function isProfile(
  ctx: NetworkProfileContext,
  profileId: NetworkProfileId
): boolean {
  return ctx.profile.id === profileId;
}

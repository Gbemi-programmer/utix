/**
 * MSW request handler factories for network profile fixtures.
 *
 * Each profile gets a set of MSW handlers that intercept Horizon requests
 * and return the profile's fixture data. This allows feature slices to test
 * against network-specific edge cases without relying on live network state.
 *
 * The handlers are clearly labeled as representing a specific network's real
 * historical behavior — fixture data is derived from real network responses,
 * not invented data.
 */

import { http, HttpResponse } from "msw";
import type { NetworkProfileId } from "@/core/testing/networkProfiles";
import { getNetworkProfile, getProfileFixtures } from "@/core/testing/networkProfiles";

/**
 * Creates MSW handlers for a given network profile.
 *
 * The handlers intercept:
 * - `GET /accounts/{id}` — returns the profile's account fixture or a 404
 * - `GET /accounts/{id}/...` — sub-resource endpoints return empty arrays
 * - `POST` (Soroban RPC) — returns the profile's network info
 *
 * Each handler includes a `X-Network-Profile` header in the response so
 * tests can verify the correct profile was matched.
 */
export function networkProfileHandlers(profileId: NetworkProfileId) {
  const profile = getNetworkProfile(profileId);
  const fixtures = getProfileFixtures(profileId);
  const { horizonUrl } = profile;

  const profileHeader = { "X-Network-Profile": profileId };

  return [
    // Account endpoint — returns the profile's account fixture
    http.get(
      `${horizonUrl}/accounts/${fixtures.accountId}`,
      () => {
        return HttpResponse.json(fixtures.accountResponse, {
          headers: profileHeader,
        });
      }
    ),

    // Account not found — returns the profile's error fixture
    http.get(
      `${horizonUrl}/accounts/:id`,
      ({ params }) => {
        // Only respond if the requested ID doesn't match our fixture account
        if (params.id === fixtures.accountId) {
          // Let the more specific handler above handle this
          return;
        }
        return HttpResponse.json(fixtures.errorResponse, {
          status: fixtures.errorResponse.status,
          headers: profileHeader,
        });
      }
    ),

    // Account sub-resources — return empty arrays for list endpoints
    http.get(
      `${horizonUrl}/accounts/:id/transactions`,
      () => {
        return HttpResponse.json({
          _links: { self: { href: "" }, next: { href: "" }, prev: { href: "" } },
          _embedded: { records: [] },
          _records: [],
        }, { headers: profileHeader });
      }
    ),

    http.get(
      `${horizonUrl}/accounts/:id/operations`,
      () => {
        return HttpResponse.json({
          _links: { self: { href: "" }, next: { href: "" }, prev: { href: "" } },
          _embedded: { records: [] },
          _records: [],
        }, { headers: profileHeader });
      }
    ),

    http.get(
      `${horizonUrl}/accounts/:id/payments`,
      () => {
        return HttpResponse.json({
          _links: { self: { href: "" }, next: { href: "" }, prev: { href: "" } },
          _embedded: { records: [] },
          _records: [],
        }, { headers: profileHeader });
      }
    ),

    http.get(
      `${horizonUrl}/accounts/:id/effects`,
      () => {
        return HttpResponse.json({
          _links: { self: { href: "" }, next: { href: "" }, prev: { href: "" } },
          _embedded: { records: [] },
          _records: [],
        }, { headers: profileHeader });
      }
    ),

    http.get(
      `${horizonUrl}/accounts/:id/offers`,
      () => {
        return HttpResponse.json({
          _links: { self: { href: "" }, next: { href: "" }, prev: { href: "" } },
          _embedded: { records: [] },
          _records: [],
        }, { headers: profileHeader });
      }
    ),

    http.get(
      `${horizonUrl}/accounts/:id/trustlines`,
      () => {
        return HttpResponse.json({
          _links: { self: { href: "" }, next: { href: "" }, prev: { href: "" } },
          _embedded: { records: fixtures.accountResponse.balances
            .filter((b: { asset_type?: string }) => b.asset_type !== "native")
            .map((b: { asset_code?: string; asset_issuer?: string; asset_type?: string }) => ({
              asset_type: b.asset_type,
              asset_code: b.asset_code,
              asset_issuer: b.asset_issuer,
              balance: "0.0000000",
              limit: "922337203685.4775807",
            })),
          _records: [],
        }, { headers: profileHeader });
      }
    ),

    // Soroban RPC getNetwork
    http.post(
      "*",
      async ({ request }) => {
        try {
          const body = await request.json() as { method?: string };
          if (body.method === "getNetwork") {
            return HttpResponse.json({
              jsonrpc: "2.0",
              id: body.id ?? 1,
              result: fixtures.networkInfo,
            }, { headers: profileHeader });
          }
        } catch {
          // Not JSON or not RPC — fall through
        }
        // Return a generic JSON-RPC error for unmatched methods
        return HttpResponse.json({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32601, message: "Method not found" },
        }, { headers: profileHeader });
      }
    ),
  ];
}

/**
 * Network-specific profile fixtures for cross-network test matrix.
 *
 * Different Stellar networks can have meaningfully different data shapes in
 * practice — futurenet enabling newer protocol features earlier, testnet
 * periodically resetting and having sparse history, mainnet having years of
 * accumulated state. These profiles capture those network-specific edge cases
 * as named fixture sets so feature slices can run their core assertions against
 * every applicable profile via a shared parameterized test helper.
 *
 * Each profile is clearly labeled as representing a specific network's real
 * historical behavior. Fixture data is derived from real network responses
 * (trimmed to what feature slices actually read), not invented data.
 *
 * Usage:
 * ```ts
 * import { runAgainstNetworkProfiles } from "@/core/testing/runAgainstProfiles";
 *
 * runAgainstNetworkProfiles(({ profile, fixtures, server }) => {
 *   it(`[${profile.id}] renders the correct state`, async () => {
 *     // profile.id, fixtures.accountResponse, etc.
 *   });
 * });
 * ```
 */

import type { StellarNetwork } from "@/core/network/types";
import { NETWORK_PASSPHRASES } from "@/core/network/config";
import type { RequestHandler } from "msw";

// ---------------------------------------------------------------------------
// Profile identity
// ---------------------------------------------------------------------------

export type NetworkProfileId =
  | "testnet-fresh-account"
  | "mainnet-established-account"
  | "futurenet-protocol-vnext";

export type NetworkProfileNetwork = StellarNetwork | "futurenet";

export type AccountState = "nonexistent" | "fresh" | "established";

export interface NetworkProfile {
  /** Stable identifier used in test labels and failure messages. */
  id: NetworkProfileId;
  /** Human-readable label shown in test output. */
  label: string;
  /**
   * One-line description of what network-specific edge case this profile
   * represents. Should reference the real network behavior being modeled.
   */
  description: string;
  /** The network this profile simulates. */
  network: NetworkProfileNetwork;
  /** Horizon URL this profile's handlers intercept. */
  horizonUrl: string;
  /** Base reserve in stroops (0.00001 XLM). */
  baseReserve: number;
  /** Minimum base fee in stroops. */
  baseFee: number;
  /** Protocol version number. */
  protocolVersion: number;
  /** Account state this profile simulates. */
  accountState: AccountState;
  /** Edge case labels this profile exercises. */
  edgeCases: readonly string[];
  /** Whether this profile requires a feature slice to support futurenet. */
  requiresFuturenet: boolean;
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

export interface ProfileAccountFixture {
  id: string;
  account_id: string;
  sequence: string;
  subentry_count: number;
  last_modified_ledger: number;
  last_modified_time: string;
  thresholds: { low_threshold: number; med_threshold: number; high_threshold: number };
  flags: {
    auth_required: boolean;
    auth_revocable: boolean;
    auth_immutable: boolean;
    auth_clawback_enabled: boolean;
  };
  balances: unknown[];
  signers: Array<{ weight: number; key: string; type: string }>;
  data: Record<string, string>;
  num_sponsoring: number;
  num_sponsored: number;
  paging_token: string;
}

export interface ProfileErrorFixture {
  type: string;
  title: string;
  status: number;
  detail?: string;
  extras?: Record<string, unknown>;
}

export interface ProfileFixtures {
  /** The account ID this profile's fixtures represent. */
  accountId: string;
  /** Horizon `/accounts/{id}` response body. */
  accountResponse: ProfileAccountFixture;
  /** Horizon error response (e.g. 404 for nonexistent accounts). */
  errorResponse: ProfileErrorFixture;
  /** Network info response (for RPC getNetwork). */
  networkInfo: {
    network_passphrase: string;
    protocol_version: number;
  };
}

export interface NetworkProfileContext {
  /** The profile being tested. */
  profile: NetworkProfile;
  /** Fixture data for this profile. */
  fixtures: ProfileFixtures;
  /** Pre-built MSW handlers for this profile. */
  handlers: RequestHandler[];
}

// ---------------------------------------------------------------------------
// Deterministic test keypairs
// ---------------------------------------------------------------------------

import { Keypair } from "@stellar/stellar-sdk";

const seed = (byte: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte));

const TESTNET_FRESH_ACCOUNT = seed(10).publicKey();
const MAINNET_ESTABLISHED_ACCOUNT = seed(20).publicKey();
const FUTURENET_VNEXT_ACCOUNT = seed(30).publicKey();
const FUTURENET_ISSUER = seed(31).publicKey();

// ---------------------------------------------------------------------------
// Profile definitions
// ---------------------------------------------------------------------------

export const NETWORK_PROFILES: readonly NetworkProfile[] = [
  {
    id: "testnet-fresh-account",
    label: "Testnet — Fresh Account",
    description:
      "Simulates a testnet account created via friendbot moments ago. " +
      "Testnet resets periodically, so accounts often have minimal history, " +
      "low sequence numbers, and may have newer feature flags enabled early.",
    network: "testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    baseReserve: 5_000_000,
    baseFee: 100,
    protocolVersion: 21,
    accountState: "fresh",
    edgeCases: [
      "recently-created-account",
      "minimal-transaction-history",
      "clawback-enabled-early",
      "low-sequence-number",
    ],
    requiresFuturenet: false,
  },
  {
    id: "mainnet-established-account",
    label: "Mainnet — Established Account",
    description:
      "Simulates a mainnet account with years of accumulated history. " +
      "High sequence numbers, many trustlines, multiple signers, and data " +
      "entries reflecting participation in multiple protocol upgrades.",
    network: "mainnet",
    horizonUrl: "https://horizon.stellar.org",
    baseReserve: 5_000_000,
    baseFee: 100,
    protocolVersion: 21,
    accountState: "established",
    edgeCases: [
      "high-sequence-number",
      "many-subentries",
      "multiple-signers",
      "data-entries-present",
      "historical-protocol-upgrades",
    ],
    requiresFuturenet: false,
  },
  {
    id: "futurenet-protocol-vnext",
    label: "Futurenet — Protocol vNext",
    description:
      "Simulates a futurenet account exercising newer protocol features " +
      "before they reach testnet/mainnet. Higher protocol version, newer " +
      "operation types, and different network parameters.",
    network: "futurenet",
    horizonUrl: "https://horizon-futurenet.stellar.org",
    baseReserve: 10_000_000,
    baseFee: 200,
    protocolVersion: 22,
    accountState: "fresh",
    edgeCases: [
      "newer-protocol-features",
      "higher-base-reserve",
      "higher-base-fee",
      "futurenet-passphrase",
      "new-operation-types",
    ],
    requiresFuturenet: true,
  },
] as const;

export function getNetworkProfile(id: NetworkProfileId): NetworkProfile {
  const profile = NETWORK_PROFILES.find((p) => p.id === id);
  if (!profile) {
    throw new Error(`Unknown network profile: ${id}`);
  }
  return profile;
}

export function isNetworkProfileId(value: unknown): value is NetworkProfileId {
  return (
    typeof value === "string" &&
    NETWORK_PROFILES.some((p) => p.id === value)
  );
}

// ---------------------------------------------------------------------------
// Fixture data per profile
// ---------------------------------------------------------------------------

const testnetFreshAccountFixture: ProfileAccountFixture = {
  id: TESTNET_FRESH_ACCOUNT,
  account_id: TESTNET_FRESH_ACCOUNT,
  sequence: "2",
  subentry_count: 1,
  last_modified_ledger: 58_234_121,
  last_modified_time: "2026-09-26T08:30:00Z",
  thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
  flags: {
    auth_required: false,
    auth_revocable: false,
    auth_immutable: false,
    auth_clawback_enabled: true,
  },
  balances: [
    {
      balance: "1000.0000000",
      asset_type: "native",
      buying_liabilities: "0.0000000",
      selling_liabilities: "0.0000000",
    },
  ],
  signers: [{ weight: 1, key: TESTNET_FRESH_ACCOUNT, type: "ed25519_public_key" }],
  data: {},
  num_sponsoring: 0,
  num_sponsored: 0,
  paging_token: TESTNET_FRESH_ACCOUNT,
};

const mainnetEstablishedAccountFixture: ProfileAccountFixture = {
  id: MAINNET_ESTABLISHED_ACCOUNT,
  account_id: MAINNET_ESTABLISHED_ACCOUNT,
  sequence: "4370426197114881",
  subentry_count: 12,
  last_modified_ledger: 58_234_121,
  last_modified_time: "2026-09-25T14:22:00Z",
  thresholds: { low_threshold: 1, med_threshold: 3, high_threshold: 5 },
  flags: {
    auth_required: true,
    auth_revocable: true,
    auth_immutable: false,
    auth_clawback_enabled: false,
  },
  balances: [
    {
      balance: "1250.5000000",
      asset_type: "native",
      buying_liabilities: "0.0000000",
      selling_liabilities: "10.0000000",
    },
    {
      balance: "42.0000000",
      limit: "922337203685.4775807",
      asset_type: "credit_alphanum4",
      asset_code: "USDC",
      asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      buying_liabilities: "0.0000000",
      selling_liabilities: "0.0000000",
      is_authorized: true,
      is_authorized_to_maintain_liabilities: true,
      last_modified_ledger: 58_234_100,
    },
    {
      balance: "3.1400000",
      limit: "922337203685.4775807",
      asset_type: "liquidity_pool_shares",
      liquidity_pool_id:
        "dd7b1ab831c273310ddbec6f97870aa83c2fbd78ce22aded37ecbf4f3380fac7",
      last_modified_ledger: 58_234_098,
    },
  ],
  signers: [
    { weight: 1, key: MAINNET_ESTABLISHED_ACCOUNT, type: "ed25519_public_key" },
    {
      weight: 2,
      key: "GBCXQUEPSEGIKXLYOIF6K5JU3S3KVKDLKUPH4ND6KPEOO3U7IXAGGYM0X",
      type: "ed25519_public_key",
    },
    {
      weight: 2,
      key: "SHA256:3c8f0c1e5b2a4d6e9f1a3b5c7d9e2f4a6b8c1d3e5f7a9b1c3d5e7f9a2b4c6d8e",
      type: "sha256_hash",
    },
  ],
  data: {
    "revyhubx:version": "djE=",
    "revyhubx:theme": "ZGFyaw==",
  },
  num_sponsoring: 0,
  num_sponsored: 0,
  paging_token: MAINNET_ESTABLISHED_ACCOUNT,
};

const futurenetVnextAccountFixture: ProfileAccountFixture = {
  id: FUTURENET_VNEXT_ACCOUNT,
  account_id: FUTURENET_VNEXT_ACCOUNT,
  sequence: "15",
  subentry_count: 3,
  last_modified_ledger: 12_456_789,
  last_modified_time: "2026-09-26T10:00:00Z",
  thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
  flags: {
    auth_required: false,
    auth_revocable: false,
    auth_immutable: false,
    auth_clawback_enabled: true,
  },
  balances: [
    {
      balance: "5000.0000000",
      asset_type: "native",
      buying_liabilities: "0.0000000",
      selling_liabilities: "0.0000000",
    },
    {
      balance: "100.0000000",
      limit: "922337203685.4775807",
      asset_type: "credit_alphanum12",
      asset_code: "FUTURETOKEN",
      asset_issuer: FUTURENET_ISSUER,
      buying_liabilities: "0.0000000",
      selling_liabilities: "0.0000000",
      is_authorized: true,
      is_authorized_to_maintain_liabilities: true,
      last_modified_ledger: 12_456_780,
    },
  ],
  signers: [
    { weight: 1, key: FUTURENET_VNEXT_ACCOUNT, type: "ed25519_public_key" },
  ],
  data: {},
  num_sponsoring: 0,
  num_sponsored: 0,
  paging_token: FUTURENET_VNEXT_ACCOUNT,
};

// ---------------------------------------------------------------------------
// Fixture lookup
// ---------------------------------------------------------------------------

const PROFILE_FIXTURES: Record<NetworkProfileId, ProfileFixtures> = {
  "testnet-fresh-account": {
    accountId: TESTNET_FRESH_ACCOUNT,
    accountResponse: testnetFreshAccountFixture,
    errorResponse: {
      type: "https://stellar.org/horizon-errors/not_found",
      title: "Resource Missing",
      status: 404,
      detail: "The resource at the requested URL was not found.",
    },
    networkInfo: {
      network_passphrase: NETWORK_PASSPHRASES.testnet,
      protocol_version: 21,
    },
  },
  "mainnet-established-account": {
    accountId: MAINNET_ESTABLISHED_ACCOUNT,
    accountResponse: mainnetEstablishedAccountFixture,
    errorResponse: {
      type: "https://stellar.org/horizon-errors/not_found",
      title: "Resource Missing",
      status: 404,
      detail: "The resource at the requested URL was not found.",
    },
    networkInfo: {
      network_passphrase: NETWORK_PASSPHRASES.mainnet,
      protocol_version: 21,
    },
  },
  "futurenet-protocol-vnext": {
    accountId: FUTURENET_VNEXT_ACCOUNT,
    accountResponse: futurenetVnextAccountFixture,
    errorResponse: {
      type: "https://stellar.org/horizon-errors/not_found",
      title: "Resource Missing",
      status: 404,
      detail: "The resource at the requested URL was not found.",
    },
    networkInfo: {
      network_passphrase: "Test SDF Future Network ; October 2024",
      protocol_version: 22,
    },
  },
};

export function getProfileFixtures(id: NetworkProfileId): ProfileFixtures {
  return PROFILE_FIXTURES[id];
}

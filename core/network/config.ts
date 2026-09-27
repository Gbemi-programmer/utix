import type { StellarNetwork } from "@/core/network/types";
import { isStellarNetwork } from "@/core/network/types";

/**
 * Network precedence, highest first:
 *   1. the user's persisted selection (if it is a known network),
 *   2. the `NEXT_PUBLIC_STELLAR_NETWORK` override (if it is a known network),
 *   3. testnet.
 * Unknown values at any level are ignored rather than guessed at.
 */
export function resolveNetwork(stored: unknown, envOverride: unknown): StellarNetwork {
  if (isStellarNetwork(stored)) return stored;
  if (isStellarNetwork(envOverride)) return envOverride;
  return "testnet";
}

export const DEFAULT_NETWORK: StellarNetwork = resolveNetwork(
  undefined,
  process.env.NEXT_PUBLIC_STELLAR_NETWORK
);

/**
 * Uses `override` only when it is an http(s) URL without embedded credentials;
 * anything else (empty, malformed, other scheme, `user:pass@`) falls back.
 */
export function resolveEndpoint(override: string | undefined, fallback: string): string {
  if (!override?.trim()) return fallback;
  try {
    const url = new URL(override.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    if (url.username || url.password) return fallback;
    return override.trim();
  } catch {
    return fallback;
  }
}

/**
 * Endpoint safe to show in diagnostics: origin and path only, so API keys in
 * the query string, fragment or userinfo never reach the UI or logs.
 */
export function redactEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "[invalid endpoint]";
  }
}

export const HORIZON_URLS: Record<StellarNetwork, string> = {
  testnet: resolveEndpoint(
    process.env.NEXT_PUBLIC_HORIZON_TESTNET_URL,
    "https://horizon-testnet.stellar.org"
  ),
  mainnet: resolveEndpoint(process.env.NEXT_PUBLIC_HORIZON_MAINNET_URL, "https://horizon.stellar.org")
};

export const SOROBAN_RPC_URLS: Record<StellarNetwork, string> = {
  testnet: resolveEndpoint(
    process.env.NEXT_PUBLIC_SOROBAN_RPC_TESTNET_URL,
    "https://soroban-testnet.stellar.org"
  ),
  mainnet: resolveEndpoint(
    process.env.NEXT_PUBLIC_SOROBAN_RPC_MAINNET_URL,
    "https://mainnet.sorobanrpc.com"
  )
};

export const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015"
};

export const NETWORK_LABELS: Record<StellarNetwork, string> = {
  testnet: "Testnet",
  mainnet: "Mainnet"
};

export interface NetworkMeta {
  label: string;
  /** Short line the helper cast uses when explaining which chain it is on. */
  blurb: string;
  /** Mainnet moves real value, so the UI gives it the cautious tone. */
  tone: "info" | "warning";
}

export const NETWORK_META: Record<StellarNetwork, NetworkMeta> = {
  testnet: {
    label: "Testnet",
    blurb: "a practice network where XLM has no market value",
    tone: "info"
  },
  mainnet: {
    label: "Mainnet",
    blurb: "the public network where balances hold real value",
    tone: "warning"
  }
};

export const FRIENDBOT_URL = "https://friendbot.stellar.org";

export const NETWORK_STORAGE_KEY = "revyhubx-network";

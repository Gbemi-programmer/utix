"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_NETWORK,
  HORIZON_URLS,
  NETWORK_LABELS,
  NETWORK_PASSPHRASES,
  NETWORK_STORAGE_KEY,
  SOROBAN_RPC_URLS,
  resolveNetwork
} from "@/core/network/config";
import type { StellarNetwork } from "@/core/network/types";
import {
  PRUNE_HORIZON_CLIENTS_DELAY_MS,
  PRUNE_HORIZON_CLIENTS_OP,
  getMaintenanceFramework
} from "@/core/workers/maintenance";

export interface NetworkContextValue {
  network: StellarNetwork;
  /** Increases on every real network switch; async work captures this value. */
  epoch: number;
  label: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  networkPassphrase: string;
  setNetwork: (network: StellarNetwork) => void;
}

const NetworkContext = createContext<NetworkContextValue | null>(null);

/**
 * The selected network lives in `localStorage`, which is an external store
 * rather than React state. Reading it through `useSyncExternalStore` gives the
 * correct server snapshot during SSR (no hydration mismatch) without an effect
 * that sets state on mount — and subscribing to the `storage` event keeps two
 * open tabs in agreement for free.
 */
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot(): StellarNetwork {
  try {
    return resolveNetwork(window.localStorage.getItem(NETWORK_STORAGE_KEY), DEFAULT_NETWORK);
  } catch {
    // Private windows and blocked site data both throw here.
    return DEFAULT_NETWORK;
  }
}

function getServerSnapshot(): StellarNetwork {
  return DEFAULT_NETWORK;
}

function writeNetwork(network: StellarNetwork): void {
  try {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
  } catch {
    // The choice still applies for this session even if it cannot be persisted.
  }
  for (const listener of listeners) listener();
}

export function NetworkProvider({
  children,
  initialNetwork
}: {
  children: React.ReactNode;
  /** Forces a network regardless of stored preference. Used by tests. */
  initialNetwork?: StellarNetwork;
}) {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [override, setOverride] = useState<StellarNetwork | undefined>(initialNetwork);
  const [epoch, setEpoch] = useState(0);
  const network = override ?? stored;

  const setNetwork = useCallback((next: StellarNetwork) => {
    if (next === network) return;
    setEpoch((current) => current + 1);
    // Keep the in-memory choice authoritative even when storage is blocked.
    setOverride(next);
    writeNetwork(next);
    // The Horizon client is memoised per network; a pruning job is enqueued as
    // delayed maintenance work so rapid switches settle before the cache is torn down.
    getMaintenanceFramework().enqueue({
      operation: PRUNE_HORIZON_CLIENTS_OP,
      params: { network: next },
      delayMs: PRUNE_HORIZON_CLIENTS_DELAY_MS
    });
  }, [network]);

  const value = useMemo<NetworkContextValue>(
    () => ({
      network,
      epoch,
      label: NETWORK_LABELS[network],
      horizonUrl: HORIZON_URLS[network],
      sorobanRpcUrl: SOROBAN_RPC_URLS[network],
      networkPassphrase: NETWORK_PASSPHRASES[network],
      setNetwork
    }),
    [epoch, network, setNetwork]
  );

  return (
    <NetworkContext.Provider value={value}>
      <NetworkEpochBoundary network={network} epoch={epoch}>
        {children}
      </NetworkEpochBoundary>
    </NetworkContext.Provider>
  );
}

/** Remounts every mounted feature slice atomically when its network identity changes. */
export function NetworkEpochBoundary({
  network,
  epoch,
  children
}: {
  network: StellarNetwork;
  epoch: number;
  children: React.ReactNode;
}) {
  return <div key={`${network}:${epoch}`} data-network-epoch={epoch}>{children}</div>;
}

export function useNetwork(): NetworkContextValue {
  const value = useContext(NetworkContext);
  if (!value) throw new Error("useNetwork must be used within a NetworkProvider.");
  return value;
}

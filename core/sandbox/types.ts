/**
 * Types and interfaces for Integration Sandbox Mode (#85)
 *
 * Simulates external Stellar blockchain services, Soroban RPC, browser wallets,
 * notification services, and webhooks in-memory without network calls or production credentials.
 */

export interface SandboxAccount {
  readonly publicKey: string;
  nativeBalanceStroops: number;
  sequence: number;
  trustlines: Array<{ assetCode: string; issuer: string; balance: string }>;
  subentryCount: number;
  flags: {
    authRequired: boolean;
    authRevocable: boolean;
    authClawback: boolean;
  };
}

export interface SandboxEvent {
  readonly id: string;
  readonly organizerPublicKey: string;
  readonly name: string;
  readonly totalCapacity: number;
  issuedCount: number;
  readonly priceStroops: number;
}

export interface SandboxTicket {
  readonly id: string;
  readonly eventId: string;
  ownerPublicKey: string;
  status: 'issued' | 'transferred' | 'locked' | 'redeemed' | 'expired' | 'burned';
  readonly validFrom: number;
  readonly validUntil: number;
  readonly qrCodeData: string;
}

export interface SandboxConfig {
  readonly enabled: boolean;
  readonly network: 'sandbox';
  readonly mockLatencyMs: number;
  readonly seedAccounts?: readonly SandboxAccount[];
  readonly seedEvents?: readonly SandboxEvent[];
  readonly seedTickets?: readonly SandboxTicket[];
}

export interface SandboxSnapshot {
  readonly timestamp: number;
  readonly accounts: Record<string, SandboxAccount>;
  readonly events: Record<string, SandboxEvent>;
  readonly tickets: Record<string, SandboxTicket>;
  readonly transactionHistory: readonly Array<{ hash: string; xdr: string; timestamp: number }>;
}

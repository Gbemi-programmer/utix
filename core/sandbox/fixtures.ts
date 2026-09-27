/**
 * Deterministic Test Fixtures for Integration Sandbox (#85)
 *
 * Pre-configured scenario fixtures for testing happy paths, edge cases, and failure modes.
 */

import { SandboxAccount, SandboxConfig, SandboxEvent, SandboxTicket } from './types';

export const SCENARIO_HAPPY_PATH_ACCOUNTS: readonly SandboxAccount[] = [
  {
    publicKey: 'G_ALICE_ORGANIZER_HAPPY',
    nativeBalanceStroops: 10_000_000_000, // 1000 XLM
    sequence: 100,
    trustlines: [],
    subentryCount: 0,
    flags: { authRequired: false, authRevocable: false, authClawback: false }
  },
  {
    publicKey: 'G_BOB_ATTENDEE_HAPPY',
    nativeBalanceStroops: 5_000_000_000, // 500 XLM
    sequence: 200,
    trustlines: [],
    subentryCount: 0,
    flags: { authRequired: false, authRevocable: false, authClawback: false }
  }
];

export const SCENARIO_HAPPY_PATH_EVENT: SandboxEvent = {
  id: 'ev_happy_01',
  organizerPublicKey: 'G_ALICE_ORGANIZER_HAPPY',
  name: 'Stellar Meridian Summit 2026',
  totalCapacity: 200,
  issuedCount: 1,
  priceStroops: 50_000_000 // 5 XLM
};

export const SCENARIO_HAPPY_PATH_TICKET: SandboxTicket = {
  id: 'tkt_happy_01',
  eventId: 'ev_happy_01',
  ownerPublicKey: 'G_BOB_ATTENDEE_HAPPY',
  status: 'issued',
  validFrom: 1700000000000,
  validUntil: 1700100000000,
  qrCodeData: 'sep7:tx?xdr=HAPPY_PATH_TICKET_DATA'
};

export const SCENARIO_INSUFFICIENT_FUNDS_ACCOUNT: SandboxAccount = {
  publicKey: 'G_POOR_USER_01',
  nativeBalanceStroops: 0, // 0 XLM
  sequence: 1,
  trustlines: [],
  subentryCount: 0,
  flags: { authRequired: false, authRevocable: false, authClawback: false }
};

export const SCENARIO_EXPIRED_TICKET: SandboxTicket = {
  id: 'tkt_expired_01',
  eventId: 'ev_happy_01',
  ownerPublicKey: 'G_BOB_ATTENDEE_HAPPY',
  status: 'issued',
  validFrom: 1600000000000,
  validUntil: 1600050000000, // Expired in past
  qrCodeData: 'sep7:tx?xdr=EXPIRED_TICKET_DATA'
};

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: true,
  network: 'sandbox',
  mockLatencyMs: 0,
  seedAccounts: SCENARIO_HAPPY_PATH_ACCOUNTS,
  seedEvents: [SCENARIO_HAPPY_PATH_EVENT],
  seedTickets: [SCENARIO_HAPPY_PATH_TICKET]
};

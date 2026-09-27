import { beforeEach, describe, expect, it } from 'vitest';
import { SandboxEnvironment } from '../environment';
import {
  DEFAULT_SANDBOX_CONFIG,
  SCENARIO_EXPIRED_TICKET,
  SCENARIO_INSUFFICIENT_FUNDS_ACCOUNT
} from '../fixtures';

describe('Integration Sandbox Mode (#85)', () => {
  let sandbox: SandboxEnvironment;

  beforeEach(() => {
    sandbox = new SandboxEnvironment(DEFAULT_SANDBOX_CONFIG);
  });

  describe('Primary Developer Workflow', () => {
    it('runs the full end-to-end ticketing journey locally with 0 external network calls', async () => {
      const result = await sandbox.executePrimaryWorkflow();

      expect(result.success).toBe(true);
      expect(result.connectedWallet).toBe('G_ALICE_DEV_TESTNET');
      expect(parseFloat(result.fundedBalanceXlm)).toBeGreaterThan(0);
      expect(result.eventCreated).toBe('event_sandbox_fest');
      expect(result.ticketIssued).toBe('tkt_sandbox_001');
      expect(result.ticketTransferred).toBe('G_BOB_RECEIVER');
      expect(result.ticketRedeemed).toBe('redeemed');

      // Verify email notification was recorded in outbox
      const outbox = sandbox.notifications.getOutbox();
      expect(outbox.length).toBeGreaterThan(0);
      expect(outbox[0].subject).toContain('Ticket Confirmed');

      // Verify webhook events were logged
      const webhooks = sandbox.webhooks.getDispatchedEvents();
      expect(webhooks.length).toBeGreaterThan(0);
      expect(webhooks.some((w) => w.payload.action === 'ticket.issued')).toBe(true);
      expect(webhooks.some((w) => w.payload.action === 'ticket.transferred')).toBe(true);
      expect(webhooks.some((w) => w.payload.action === 'ticket.redeemed')).toBe(true);
    });
  });

  describe('Fake External Service Adapters', () => {
    it('FakeHorizonAdapter retrieves account and simulates Friendbot funding deterministically', async () => {
      const pubKey = 'G_NEW_DEV_USER';
      const initial = await sandbox.horizon.getAccount(pubKey);
      expect(initial.ok).toBe(false);

      // Friendbot fund
      const fundRes = await sandbox.horizon.fundAccount(pubKey, 10_000_000_000);
      expect(fundRes.ok).toBe(true);

      // Verify account now exists
      const after = await sandbox.horizon.getAccount(pubKey);
      expect(after.ok).toBe(true);
      if (after.ok) {
        expect(after.value.balances[0].balance).toBe('1000.0000000');
        expect(after.value.sequence).toBe('1');
      }
    });

    it('FakeSorobanRpcAdapter simulates health, simulation, and transaction submissions', async () => {
      const health = await sandbox.soroban.getHealth();
      expect(health.status).toBe('healthy');

      const sim = await sandbox.soroban.simulateTransaction('AAAAXDR...');
      expect(sim.minResourceFee).toBe('1500');

      const tx = await sandbox.soroban.sendTransaction('SIGNED_SOROBAN_XDR...');
      expect(tx.status).toBe('SUCCESS');
      expect(tx.hash).toContain('soroban_tx_');

      const txStatus = await sandbox.soroban.getTransaction(tx.hash);
      expect(txStatus.status).toBe('SUCCESS');

      const entries = await sandbox.soroban.getLedgerEntries(['CONTRACT_KEY_1']);
      expect(entries.entries.length).toBe(1);
      expect(entries.entries[0].key).toBe('CONTRACT_KEY_1');

      const events = await sandbox.soroban.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].topics).toContain('ticket_minted');
    });

    it('FakeWalletAdapter handles connect, disconnect, and signing deterministically', async () => {
      expect(sandbox.wallet.isConnected()).toBe(false);

      const conn = await sandbox.wallet.connect('G_TEST_KEY_123');
      expect(conn.publicKey).toBe('G_TEST_KEY_123');
      expect(sandbox.wallet.isConnected()).toBe(true);

      const signRes = await sandbox.wallet.signTransaction('UNEVEN_XDR');
      expect(signRes.signedXdr).toContain('SIGNED_G_TEST_KEY_123_UNEVEN_XDR');

      sandbox.wallet.disconnect();
      expect(sandbox.wallet.isConnected()).toBe(false);
    });
  });

  describe('Error Scenario Fixtures', () => {
    it('handles insufficient funds failure when buying ticket', async () => {
      const poorUser = SCENARIO_INSUFFICIENT_FUNDS_ACCOUNT.publicKey;
      await sandbox.horizon.fundAccount(poorUser, 0); // 0 balance

      const buyRes = await sandbox.buyTicket({
        ticketId: 'tkt_fail_01',
        eventId: 'ev_happy_01',
        buyerPublicKey: poorUser
      });

      expect(buyRes.ok).toBe(false);
      if (!buyRes.ok) {
        expect(buyRes.code).toBe('insufficient_funds');
      }
    });

    it('handles expired ticket redemption failure', async () => {
      const envWithExpired = new SandboxEnvironment({
        seedTickets: [SCENARIO_EXPIRED_TICKET]
      });

      const redeemRes = await envWithExpired.redeemTicket({
        ticketId: SCENARIO_EXPIRED_TICKET.id,
        claimerPublicKey: SCENARIO_EXPIRED_TICKET.ownerPublicKey
      });

      expect(redeemRes.ok).toBe(false);
      if (!redeemRes.ok) {
        expect(redeemRes.code).toBe('ticket_expired');
      }
    });

    it('handles double redemption prevention', async () => {
      const buyRes = await sandbox.buyTicket({
        ticketId: 'tkt_double_01',
        eventId: 'ev_happy_01',
        buyerPublicKey: 'G_BOB_ATTENDEE_HAPPY'
      });
      expect(buyRes.ok).toBe(true);

      const redeem1 = await sandbox.redeemTicket({
        ticketId: 'tkt_double_01',
        claimerPublicKey: 'G_BOB_ATTENDEE_HAPPY'
      });
      expect(redeem1.ok).toBe(true);

      // Second attempt must fail
      const redeem2 = await sandbox.redeemTicket({
        ticketId: 'tkt_double_01',
        claimerPublicKey: 'G_BOB_ATTENDEE_HAPPY'
      });
      expect(redeem2.ok).toBe(false);
      if (!redeem2.ok) {
        expect(redeem2.code).toBe('ticket_already_redeemed');
      }
    });
  });

  describe('Snapshot & State Restoration', () => {
    it('captures sandbox snapshot and restores previous state faithfully', async () => {
      const snapshot = sandbox.takeSnapshot();

      // Mutate state
      await sandbox.horizon.fundAccount('G_TEMPORARY_USER', 50_0000000);
      const acc = await sandbox.horizon.getAccount('G_TEMPORARY_USER');
      expect(acc.ok).toBe(true);

      // Restore snapshot
      sandbox.restoreSnapshot(snapshot);

      // Verify mutation is reverted
      const accAfterRestore = await sandbox.horizon.getAccount('G_TEMPORARY_USER');
      expect(accAfterRestore.ok).toBe(false);
    });
  });
});

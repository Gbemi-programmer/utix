/**
 * Sandbox Environment Controller (#85)
 *
 * Manages the sandbox lifecycle, in-memory state, deterministic fixtures,
 * snapshots, and coordinates fake external adapters.
 */

import { err, ok, type Result } from '@/core/result/result';
import {
  FakeHorizonAdapter,
  FakeNotificationAdapter,
  FakeSorobanRpcAdapter,
  FakeWalletAdapter,
  FakeWebhookDispatcherAdapter
} from './adapters';
import {
  SandboxAccount,
  SandboxConfig,
  SandboxEvent,
  SandboxSnapshot,
  SandboxTicket
} from './types';

export class SandboxEnvironment {
  public readonly horizon: FakeHorizonAdapter;
  public readonly soroban: FakeSorobanRpcAdapter;
  public readonly wallet: FakeWalletAdapter;
  public readonly notifications: FakeNotificationAdapter;
  public readonly webhooks: FakeWebhookDispatcherAdapter;

  private accounts: Map<string, SandboxAccount> = new Map();
  private events: Map<string, SandboxEvent> = new Map();
  private tickets: Map<string, SandboxTicket> = new Map();
  private transactions: Map<string, { hash: string; xdr: string; timestamp: number }> = new Map();
  private virtualTimeOffsetMs: number = 0;

  constructor(config?: Partial<SandboxConfig>) {
    const latency = config?.mockLatencyMs ?? 0;

    this.horizon = new FakeHorizonAdapter(this.accounts, this.transactions, latency);
    this.soroban = new FakeSorobanRpcAdapter(latency);
    this.wallet = new FakeWalletAdapter();
    this.notifications = new FakeNotificationAdapter();
    this.webhooks = new FakeWebhookDispatcherAdapter();

    if (config?.seedAccounts) {
      for (const acc of config.seedAccounts) {
        this.accounts.set(acc.publicKey, { ...acc });
      }
    }
    if (config?.seedEvents) {
      for (const ev of config.seedEvents) {
        this.events.set(ev.id, { ...ev });
      }
    }
    if (config?.seedTickets) {
      for (const tkt of config.seedTickets) {
        this.tickets.set(tkt.id, { ...tkt });
      }
    }
  }

  public now(): number {
    return Date.now() + this.virtualTimeOffsetMs;
  }

  public advanceTime(seconds: number): void {
    this.virtualTimeOffsetMs += seconds * 1000;
  }

  public createEvent(params: {
    id: string;
    organizerPublicKey: string;
    name: string;
    totalCapacity: number;
    priceStroops: number;
  }): Result<SandboxEvent, string> {
    if (this.events.has(params.id)) {
      return err('event_already_exists');
    }
    const event: SandboxEvent = {
      ...params,
      issuedCount: 0
    };
    this.events.set(event.id, event);
    this.webhooks.dispatch('https://api.utix.dev/webhooks/events', {
      action: 'event.created',
      eventId: event.id,
      timestamp: this.now()
    });
    return ok(event);
  }

  public async buyTicket(params: {
    ticketId: string;
    eventId: string;
    buyerPublicKey: string;
    validDurationHours?: number;
  }): Promise<Result<SandboxTicket, string>> {
    const event = this.events.get(params.eventId);
    if (!event) return err('event_not_found');

    if (event.issuedCount >= event.totalCapacity) {
      return err('event_sold_out');
    }

    const buyer = this.accounts.get(params.buyerPublicKey);
    if (!buyer || buyer.nativeBalanceStroops < event.priceStroops) {
      return err('insufficient_funds');
    }

    // Deduct balance and credit organizer
    buyer.nativeBalanceStroops -= event.priceStroops;
    const organizer = this.accounts.get(event.organizerPublicKey);
    if (organizer) {
      organizer.nativeBalanceStroops += event.priceStroops;
    }

    event.issuedCount += 1;

    const validFrom = this.now();
    const validUntil = validFrom + (params.validDurationHours ?? 48) * 3600 * 1000;

    const ticket: SandboxTicket = {
      id: params.ticketId,
      eventId: params.eventId,
      ownerPublicKey: params.buyerPublicKey,
      status: 'issued',
      validFrom,
      validUntil,
      qrCodeData: `sep7:tx?xdr=SANDBOX_TICKET_${params.ticketId}`
    };

    this.tickets.set(ticket.id, ticket);

    this.notifications.sendEmail(
      `${params.buyerPublicKey.slice(0, 8)}@sandbox.local`,
      `Ticket Confirmed: ${event.name}`,
      `Your ticket ${ticket.id} for ${event.name} is confirmed! QR Code Data: ${ticket.qrCodeData}`
    );

    this.webhooks.dispatch('https://api.utix.dev/webhooks/tickets', {
      action: 'ticket.issued',
      ticketId: ticket.id,
      eventId: event.id,
      buyer: params.buyerPublicKey
    });

    return ok(ticket);
  }

  public async transferTicket(params: {
    ticketId: string;
    fromPublicKey: string;
    toPublicKey: string;
  }): Promise<Result<SandboxTicket, string>> {
    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) return err('ticket_not_found');

    if (ticket.ownerPublicKey !== params.fromPublicKey) {
      return err('unauthorized_transfer');
    }

    if (ticket.status !== 'issued' && ticket.status !== 'transferred') {
      return err(`cannot_transfer_status_${ticket.status}`);
    }

    ticket.ownerPublicKey = params.toPublicKey;
    ticket.status = 'transferred';

    this.webhooks.dispatch('https://api.utix.dev/webhooks/transfers', {
      action: 'ticket.transferred',
      ticketId: ticket.id,
      from: params.fromPublicKey,
      to: params.toPublicKey
    });

    return ok(ticket);
  }

  public async redeemTicket(params: {
    ticketId: string;
    claimerPublicKey: string;
  }): Promise<Result<SandboxTicket, string>> {
    const ticket = this.tickets.get(params.ticketId);
    if (!ticket) return err('ticket_not_found');

    if (ticket.ownerPublicKey !== params.claimerPublicKey) {
      return err('claimer_not_owner');
    }

    if (ticket.status === 'redeemed') {
      return err('ticket_already_redeemed');
    }

    if (ticket.status === 'expired' || this.now() > ticket.validUntil) {
      ticket.status = 'expired';
      return err('ticket_expired');
    }

    if (this.now() < ticket.validFrom) {
      return err('ticket_not_yet_valid');
    }

    ticket.status = 'redeemed';

    this.webhooks.dispatch('https://api.utix.dev/webhooks/checkin', {
      action: 'ticket.redeemed',
      ticketId: ticket.id,
      claimer: params.claimerPublicKey,
      timestamp: this.now()
    });

    return ok(ticket);
  }

  public takeSnapshot(): SandboxSnapshot {
    const accountsObj: Record<string, SandboxAccount> = {};
    for (const [k, v] of this.accounts.entries()) accountsObj[k] = { ...v };

    const eventsObj: Record<string, SandboxEvent> = {};
    for (const [k, v] of this.events.entries()) eventsObj[k] = { ...v };

    const ticketsObj: Record<string, SandboxTicket> = {};
    for (const [k, v] of this.tickets.entries()) ticketsObj[k] = { ...v };

    const history = Array.from(this.transactions.values());

    return {
      timestamp: this.now(),
      accounts: accountsObj,
      events: eventsObj,
      tickets: ticketsObj,
      transactionHistory: history
    };
  }

  public restoreSnapshot(snapshot: SandboxSnapshot): void {
    this.accounts.clear();
    for (const [k, v] of Object.entries(snapshot.accounts)) {
      this.accounts.set(k, { ...v });
    }

    this.events.clear();
    for (const [k, v] of Object.entries(snapshot.events)) {
      this.events.set(k, { ...v });
    }

    this.tickets.clear();
    for (const [k, v] of Object.entries(snapshot.tickets)) {
      this.tickets.set(k, { ...v });
    }

    this.transactions.clear();
    for (const tx of snapshot.transactionHistory) {
      this.transactions.set(tx.hash, { ...tx });
    }
  }

  public reset(): void {
    this.accounts.clear();
    this.events.clear();
    this.tickets.clear();
    this.transactions.clear();
    this.virtualTimeOffsetMs = 0;
    this.notifications.clearOutbox();
    this.webhooks.clearDispatchedEvents();
    this.wallet.disconnect();
  }

  /**
   * Executes the full primary developer workflow locally with 0 network calls.
   */
  public async executePrimaryWorkflow(): Promise<{
    success: boolean;
    connectedWallet: string;
    fundedBalanceXlm: string;
    eventCreated: string;
    ticketIssued: string;
    ticketTransferred: string;
    ticketRedeemed: string;
  }> {
    // 1. Connect simulated wallet
    const { publicKey } = await this.wallet.connect('G_ALICE_DEV_TESTNET');

    // 2. Fund with simulated Friendbot
    await this.horizon.fundAccount(publicKey, 500_0000000); // 500 XLM
    const accResult = await this.horizon.getAccount(publicKey);
    const nativeBal = accResult.ok ? accResult.value.balances[0].balance : '0';

    // 3. Create Event
    const organizer = 'G_ORGANIZER_DEV';
    await this.horizon.fundAccount(organizer, 100_0000000);
    const eventRes = this.createEvent({
      id: 'event_sandbox_fest',
      organizerPublicKey: organizer,
      name: 'Sandbox Developer Conference 2026',
      totalCapacity: 50,
      priceStroops: 50_000_000 // 5 XLM
    });

    // 4. Buy ticket
    const buyRes = await this.buyTicket({
      ticketId: 'tkt_sandbox_001',
      eventId: 'event_sandbox_fest',
      buyerPublicKey: publicKey
    });

    // 5. Transfer ticket to Bob
    const bob = 'G_BOB_RECEIVER';
    await this.horizon.fundAccount(bob, 10_0000000);
    const transferRes = await this.transferTicket({
      ticketId: 'tkt_sandbox_001',
      fromPublicKey: publicKey,
      toPublicKey: bob
    });

    // 6. Redeem ticket at gate
    const redeemRes = await this.redeemTicket({
      ticketId: 'tkt_sandbox_001',
      claimerPublicKey: bob
    });

    return {
      success: buyRes.ok && transferRes.ok && redeemRes.ok && eventRes.ok,
      connectedWallet: publicKey,
      fundedBalanceXlm: nativeBal,
      eventCreated: eventRes.ok ? eventRes.value.id : '',
      ticketIssued: buyRes.ok ? buyRes.value.id : '',
      ticketTransferred: transferRes.ok ? transferRes.value.ownerPublicKey : '',
      ticketRedeemed: redeemRes.ok ? redeemRes.value.status : ''
    };
  }
}

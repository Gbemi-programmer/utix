/**
 * Fake External Service Adapters for Integration Sandbox (#85)
 *
 * Provides deterministic in-memory implementations for:
 * 1. Horizon REST API (Account info, transactions, Friendbot faucet)
 * 2. Soroban RPC (Contract invocation, health, simulation, events, ledger entries)
 * 3. Browser Wallet (Freighter/Albedo connection and signing simulation)
 * 4. Email Notification Service (In-memory outbox)
 * 5. Webhook Dispatcher (In-memory dispatch log)
 */

import { err, ok, type Result } from '@/core/result/result';
import { SandboxAccount, SandboxTicket } from './types';

export interface HorizonAccountResponse {
  readonly id: string;
  readonly account_id: string;
  readonly sequence: string;
  readonly subentry_count: number;
  readonly balances: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
  }>;
  readonly flags: {
    auth_required: boolean;
    auth_revocable: boolean;
    auth_clawback_enabled: boolean;
  };
}

export class FakeHorizonAdapter {
  constructor(
    private accounts: Map<string, SandboxAccount>,
    private transactions: Map<string, { hash: string; xdr: string; timestamp: number }>,
    private latencyMs: number = 0
  ) {}

  private async simulateLatency(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
  }

  public async getAccount(publicKey: string): Promise<Result<HorizonAccountResponse, 'account_not_found'>> {
    await this.simulateLatency();
    const account = this.accounts.get(publicKey);
    if (!account) {
      return err('account_not_found');
    }

    const nativeXlm = (account.nativeBalanceStroops / 10_000_000).toFixed(7);
    const balances = [
      { asset_type: 'native', balance: nativeXlm },
      ...account.trustlines.map((t) => ({
        asset_type: 'credit_alphanum4',
        asset_code: t.assetCode,
        asset_issuer: t.issuer,
        balance: t.balance
      }))
    ];

    return ok({
      id: account.publicKey,
      account_id: account.publicKey,
      sequence: String(account.sequence),
      subentry_count: account.subentryCount,
      balances,
      flags: {
        auth_required: account.flags.authRequired,
        auth_revocable: account.flags.authRevocable,
        auth_clawback_enabled: account.flags.authClawback
      }
    });
  }

  public async fundAccount(
    publicKey: string,
    amountStroops: number = 10_000_000_000 // 1,000 XLM
  ): Promise<Result<{ funded: boolean; balanceStroops: number }, string>> {
    await this.simulateLatency();
    let account = this.accounts.get(publicKey);
    if (!account) {
      account = {
        publicKey,
        nativeBalanceStroops: amountStroops,
        sequence: 1,
        trustlines: [],
        subentryCount: 0,
        flags: { authRequired: false, authRevocable: false, authClawback: false }
      };
      this.accounts.set(publicKey, account);
    } else {
      account.nativeBalanceStroops += amountStroops;
    }

    return ok({ funded: true, balanceStroops: account.nativeBalanceStroops });
  }

  public async submitTransaction(
    envelopeXdr: string
  ): Promise<Result<{ hash: string; ledger: number; successful: boolean }, 'tx_failed'>> {
    await this.simulateLatency();
    if (!envelopeXdr || envelopeXdr.trim() === '') {
      return err('tx_failed');
    }

    const hash = `hash_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.transactions.set(hash, { hash, xdr: envelopeXdr, timestamp: Date.now() });

    return ok({
      hash,
      ledger: 100_000 + this.transactions.size,
      successful: true
    });
  }

  public async getFeeStats(): Promise<{ min: number; mode: number; p90: number }> {
    await this.simulateLatency();
    return { min: 100, mode: 100, p90: 250 };
  }
}

export class FakeSorobanRpcAdapter {
  private events: Array<{ type: string; contractId: string; topics: string[]; value: string }> = [];
  private ledgerEntries: Map<string, { xdr: string; lastModifiedLedgerSeq: number }> = new Map();

  constructor(private latencyMs: number = 0) {}

  public async getHealth(): Promise<{ status: 'healthy'; latestLedger: number }> {
    return { status: 'healthy', latestLedger: 100_500 };
  }

  public async simulateTransaction(
    _xdr: string
  ): Promise<{ results: Array<{ auth: string[]; returnVal: string }>; minResourceFee: string; latestLedger: number }> {
    return {
      results: [{ auth: [], returnVal: 'AAAAEAAAAAE=' }],
      minResourceFee: '1500',
      latestLedger: 100_500
    };
  }

  public async sendTransaction(
    signedXdr: string
  ): Promise<{ status: 'PENDING' | 'SUCCESS'; hash: string }> {
    const hash = `soroban_tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.events.push({
      type: 'contract',
      contractId: 'CA...TICKET_REGISTRY',
      topics: ['ticket_minted'],
      value: signedXdr.slice(0, 16)
    });
    return { status: 'SUCCESS', hash };
  }

  public async getTransaction(
    hash: string
  ): Promise<{ status: 'SUCCESS' | 'NOT_FOUND'; latestLedger: number; resultXdr?: string }> {
    return {
      status: 'SUCCESS',
      latestLedger: 100_500,
      resultXdr: 'AAAAAgAAAAE='
    };
  }

  public async getEvents(): Promise<Array<{ type: string; contractId: string; topics: string[]; value: string }>> {
    return [...this.events];
  }

  public async getLedgerEntries(
    keys: string[]
  ): Promise<{ entries: Array<{ key: string; xdr: string; lastModifiedLedgerSeq: number }>; latestLedger: number }> {
    const entries = keys.map((key) => ({
      key,
      xdr: this.ledgerEntries.get(key)?.xdr ?? 'AAAAEAAAAAE=',
      lastModifiedLedgerSeq: this.ledgerEntries.get(key)?.lastModifiedLedgerSeq ?? 100_500
    }));
    return { entries, latestLedger: 100_500 };
  }
}

export class FakeWalletAdapter {
  private connectedAccount: string | null = null;

  public async connect(defaultAccount = 'G_SANDBOX_USER_WALLET'): Promise<{ publicKey: string }> {
    this.connectedAccount = defaultAccount;
    return { publicKey: defaultAccount };
  }

  public disconnect(): void {
    this.connectedAccount = null;
  }

  public isConnected(): boolean {
    return this.connectedAccount !== null;
  }

  public async getPublicKey(): Promise<string> {
    if (!this.connectedAccount) {
      throw new Error('Wallet not connected');
    }
    return this.connectedAccount;
  }

  public async signTransaction(xdr: string): Promise<{ signedXdr: string }> {
    if (!this.connectedAccount) throw new Error('Wallet not connected');
    return { signedXdr: `SIGNED_${this.connectedAccount}_${xdr}` };
  }

  public async signAuthEntry(entryXdr: string): Promise<{ signedEntryXdr: string }> {
    if (!this.connectedAccount) throw new Error('Wallet not connected');
    return { signedEntryXdr: `AUTH_SIGNED_${this.connectedAccount}_${entryXdr}` };
  }
}

export class FakeNotificationAdapter {
  private outbox: Array<{ to: string; subject: string; body: string; timestamp: number }> = [];

  public sendEmail(to: string, subject: string, body: string): void {
    this.outbox.push({ to, subject, body, timestamp: Date.now() });
  }

  public getOutbox(): ReadonlyArray<{ to: string; subject: string; body: string; timestamp: number }> {
    return [...this.outbox];
  }

  public clearOutbox(): void {
    this.outbox.length = 0;
  }
}

export class FakeWebhookDispatcherAdapter {
  private dispatched: Array<{ endpoint: string; payload: Record<string, unknown>; timestamp: number }> = [];

  public dispatch(endpoint: string, payload: Record<string, unknown>): void {
    this.dispatched.push({ endpoint, payload, timestamp: Date.now() });
  }

  public getDispatchedEvents(): ReadonlyArray<{
    endpoint: string;
    payload: Record<string, unknown>;
    timestamp: number;
  }> {
    return [...this.dispatched];
  }

  public clearDispatchedEvents(): void {
    this.dispatched.length = 0;
  }
}

# Integration Sandbox Mode

The Utix Sandbox Mode provides an isolated, deterministic, in-memory testing environment designed for contributors and automated integration testing without requiring real Stellar network access, live wallets, Soroban testnets, or third-party API credentials.

The sandbox implementation is located in [`core/sandbox/`](file:///Users/favoureze/utix/core/sandbox).

---

## Capabilities & Architecture

- **Zero Network I/O**: Intercepts Horizon, Soroban RPC, wallet connections, email notifications, and webhooks completely in-memory.
- **Deterministic**: Produces reproducible test runs across environments and CI pipelines.
- **Snapshots & Time Travel**: Capture full system snapshots (`sandbox.takeSnapshot()`), restore them (`sandbox.restoreSnapshot()`), and advance virtual time (`sandbox.advanceTime()`).
- **Complete User Journey Simulation**: Covers the full ticketing lifecycle from Friendbot funding, event creation, ticket purchasing, secondary transfers, to QR gate check-in and redemption.

---

## Available Service Adapters

### 1. Fake Horizon Adapter (`FakeHorizonAdapter`)
- Simulates account lookups (`/accounts/{id}`) with native and credit asset balances.
- Simulates Friendbot testnet faucet funding (`fundAccount`).
- Simulates transaction envelope submission and fee statistics.

### 2. Fake Soroban RPC Adapter (`FakeSorobanRpcAdapter`)
- Simulates RPC health checks (`getHealth`).
- Simulates transaction simulations (`simulateTransaction`) and return values.
- Simulates transaction submission (`sendTransaction`) and contract event queries (`getEvents`).

### 3. Fake Wallet Adapter (`FakeWalletAdapter`)
- Emulates browser extension wallets (Freighter, Albedo, Lobstr).
- Supports mock connect, disconnect, transaction signing (`signTransaction`), and auth entry signing (`signAuthEntry`).

### 4. Fake Notification Adapter (`FakeNotificationAdapter`)
- Intercepts sent emails and notifications in an in-memory outbox for test assertions.

### 5. Fake Webhook Dispatcher (`FakeWebhookDispatcherAdapter`)
- Records emitted webhook events (`event.created`, `ticket.issued`, `ticket.transferred`, `ticket.redeemed`) in an in-memory log.

---

## Deterministic Test Fixtures

Pre-configured test fixtures are available in [`core/sandbox/fixtures.ts`](file:///Users/favoureze/utix/core/sandbox/fixtures.ts):
- `SCENARIO_HAPPY_PATH_ACCOUNTS` & `SCENARIO_HAPPY_PATH_EVENT`: Pre-funded organizer and attendee accounts with active events.
- `SCENARIO_INSUFFICIENT_FUNDS_ACCOUNT`: Zero-balance account for testing checkout failure handling.
- `SCENARIO_EXPIRED_TICKET`: Ticket past its `validUntil` window for testing gate rejection.

---

## Local Usage Example

```typescript
import { SandboxEnvironment, DEFAULT_SANDBOX_CONFIG } from '@/core/sandbox';

const sandbox = new SandboxEnvironment(DEFAULT_SANDBOX_CONFIG);

// 1. Connect simulated wallet
const { publicKey } = await sandbox.wallet.connect('G_DEV_USER');

// 2. Fund account with simulated Friendbot
await sandbox.horizon.fundAccount(publicKey, 1_000_0000000); // 1,000 XLM

// 3. Run primary workflow
const result = await sandbox.executePrimaryWorkflow();
console.log('Workflow status:', result.success);
```

---

## Running Sandbox Tests

```bash
npm test -- core/sandbox
```

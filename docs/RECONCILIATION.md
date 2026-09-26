# Reconciliation

Utix stores records (worker jobs, notifications, export envelopes, idempotency
claims) and it also *shows* numbers it read from a Stellar ledger. Nothing
guaranteed those two worlds stayed in agreement: a cached balance could drift
from the ledger, a job could sit in `retrying` for an hour, an envelope could
outlive its retention window, an idempotency claim could never settle.

`core/reconciliation/` compares the two and produces a **read-only dry-run
report**. There is no repair path in the module, on purpose: drift is reported
with guidance and a human decides what to do.

## The four drift kinds

| Kind | Means | Example invariant |
| --- | --- | --- |
| `missing` | a record exists on one side, not the other | a stored balance with no ledger entry |
| `duplicate` | two records claim one identity | two pending jobs sharing a `dedupeKey` |
| `stale` | a record is still open past its deadline | a `retrying` job past its backoff, an expired idempotency record |
| `inconsistent` | two fields of one record disagree | stored balance ≠ ledger balance; a job past its retry budget that is not terminal |

Every invariant is declared once, in `RECONCILIATION_INVARIANTS`, with its
statement and its repair guidance. A finding copies the guidance onto itself, so
a report is actionable without the source open.

## Running a dry run

```ts
import { reconcile, formatReport } from "@/core/reconciliation/reconciliation";

const report = reconcile({
  storedBalances,   // what the app stored and showed
  ledgerBalances,   // what Horizon reports now, with a settlement reference
  jobs,             // JobPayload[]
  notifications,    // Notification[]
  idempotencyRecords,
  exportEnvelopes,
  operations,       // retained measured operations
  now: Date.now(),
  staleAfterMs: 5 * 60_000
});

console.log(formatReport(report));
report.dryRun; // always true
report.clean;  // false when any finding is `critical` (i.e. inconsistent)
```

As a registered worker operation, which is how it runs in the app:

```ts
import { registerReconciliation, RECONCILIATION_DRY_RUN_OP } from "@/core/reconciliation/job";
import { createWorkerFramework } from "@/core/workers/queue";

const framework = createWorkerFramework();
const runNow = registerReconciliation({ framework, providers: { read: () => snapshot() } });

framework.enqueue({ operation: RECONCILIATION_DRY_RUN_OP, delayMs: 1_000 });
framework.drainDueJobs();

// Or synchronously, which is what a CLI or a test wants:
const result = runNow();
```

The run itself has a lifecycle (`reconciliation_run`: `pending → collecting →
analyzing → reported`, with `failed` and `cancelled` as terminal states), so a
crashed run is as inspectable as a job.

## Why it is safe to run anywhere

- **Pure.** Every check is a function of the supplied snapshot. The engine
  contains no storage write, no filesystem write and no assignment into the
  snapshot, and the suite freezes the snapshot to prove it.
- **Injected clock and sources.** `now` and the provider are arguments, so CI
  can point a run at a fixture and get the same report every time.
- **Read failure is loud.** A provider that throws yields
  `snapshot_unavailable` and no report at all, rather than a partial one that
  looks clean.
- **Redacted.** A finding quotes record values, so an embedded secret is
  scrubbed (`scrubSecrets`) before the report is built, and the report passes
  through `core/telemetry`'s `redact()` on the way out.

`npm run verify:reconciliation` is the CI guard: it fails if an invariant is
declared but never checked, if a check references an undeclared invariant, if a
drift kind disappears, or if the engine ever grows a write path.

## Repair guidance, not repair

Findings carry a `repair` string. None of it is executed. The reasoning:

- The ledger is authoritative for an amount. A human re-reads the account and
  re-caches the line; nobody edits a stored balance to match a number they are
  trying to verify.
- A stale job is a scheduling gap, not a handler bug: `processJob(id)` or
  `retryJob(id)`, then look at why it was not due.
- An expired idempotency record is swept, never edited. A replay must be either
  a real recorded outcome or absent, or a duplicate side effect becomes
  possible.
- A truncated export envelope is regenerated under a fresh idempotency key; a
  consumer cannot tell a short envelope from a complete one.

## Adding an invariant

1. Add the entry to `RECONCILIATION_INVARIANTS` with its `kind` and `repair`.
2. Add a check to the `checks` table using `finding(invariant, …)`; the helper
   throws if the invariant is undeclared.
3. Add a scenario to the suite — one per drift kind you claim.
4. Run `npm run verify:reconciliation` and `npm test -- core/reconciliation`.

```bash
npm run verify:reconciliation   # invariants wired, no write path
npm test -- core/reconciliation # drift scenarios, read-only guarantee
```

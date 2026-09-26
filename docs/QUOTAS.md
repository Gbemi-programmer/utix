# Quota controls

Expensive operations are metered by `core/quota/`. The goal is to stop abuse,
runaway costs and accidental resource exhaustion — a scalping script, a retry
loop, a stuck button — without getting in the way of a real box office on a
sell-out night.

## What is metered

Every metered operation is declared once in `QUOTA_POLICIES`
(`core/quota/quota.ts`). An operation that is not declared is refused with
`quota_unknown_operation`, never silently unmetered.

| Operation              | Resource       | Per principal | Global   | Window | Why                                              |
| ---------------------- | -------------- | ------------- | -------- | ------ | ------------------------------------------------ |
| `ticket.issue`         | storage        | 500           | 20,000   | 1 h    | Durable record, and a funded entry on-chain      |
| `ticket.transfer`      | storage        | 20            | 5,000    | 1 h    | Rapid transfer chains signal scalping/laundering |
| `ticket.redeem`        | compute        | 1,200         | 50,000   | 1 h    | Signature verification per scan                  |
| `event.create`         | storage        | 10            | 500      | 1 day  | Allocates inventory, tiers and search entries    |
| `event.update`         | storage        | 120           | —        | 1 h    | Re-validates inventory, notifies holders         |
| `fraud.screen`         | external_api   | 200           | 5,000    | 1 h    | Billed per call upstream                         |
| `export.generate`      | compute        | 20            | 500      | 1 h    | Collects, redacts and paginates every record     |
| `worker.enqueue`       | compute        | 100           | 2,000    | 1 h    | Each job may run several times with retries      |
| `notification.publish` | storage        | 60            | 5,000    | 1 h    | Persisted per recipient until purged             |
| `horizon.request`      | external_api   | 120           | 1,000    | 1 min  | Shared Horizon rate limit                        |
| `rpc.simulate`         | external_api   | 60            | 500      | 1 min  | Most expensive Soroban RPC method                |
| `faucet.fund`          | external_api   | 5             | 200      | 1 day  | Rate limited upstream, trivially farmed          |
| `index.rebuild`        | indexing       | 2             | 10       | 1 day  | Re-reads every ledger range for an event         |
| `analytics.aggregate`  | indexing       | 30            | 600      | 1 h    | Scans the operation index                        |

Windows are fixed and aligned to the epoch (`floor(now / windowMs)`), so every
instance agrees on when a window resets.

**Enforced today:** `export.generate` (in `exportRecords`) and `worker.enqueue`
(in `WorkerFramework.submit`). The remaining operations are declared so that
their call sites charge them through `consume()` or `withQuota()` as they land.

## Semantics

- **Both counters must have room.** A spend is checked against the principal's
  limit and the global limit; it is recorded against both or neither. A batch
  (`cost: 40`) that would overshoot is refused whole, not partially spent.
- **Replays are free.** An idempotent replay returns before quota is charged.
  On a denial, the idempotency claim is *released*, not failed, so the same key
  succeeds after the window resets.
- **Refunds are explicit.** A failed attempt keeps its spend by default — that
  is the runaway case. `withQuota(store, { refundOn: [...] })` refunds only for
  codes that mean the work never started. A receipt refunds at most once and
  never into a later window.
- **Cheap refusals come first.** Exports are charged after authorization and
  schema checks, so a request that would be refused anyway costs nothing.

## Overrides

`grantOverride(actor, { operation, subject, limit, reason, ttlMs })`:

- only a `maintainer` actor may grant or revoke (`quota_override_denied`);
- `subject` is a principal, or `*` for the global limit;
- `limit` is `0 ≤ limit ≤ maxOverrideLimit` (default 10× the policy limit);
  `0` blocks the subject — the fraud-response lever;
- `ttlMs` is required and at most 7 days; expiry is enforced on read;
- `reason` is a stable code (`event.onsale_peak`, `fraud.block`), not free text;
- every grant and revoke, allowed or denied, writes an audit event
  (`quota.override_granted` / `quota.override_revoked`) with the previous and
  policy limits.

## Errors

A denial is `err("quota_exceeded", QuotaDenial)`. The detail is safe to show a
user: operation, resource, whether the limit was theirs (`principal`) or shared
(`global`), `retryAfterMs` (`null` when an override blocks them) and a
correlation id. It contains no counts, limits or other principals.

`describeQuotaError(code, denial)` turns it into copy:

| Case              | Title               | Retry         |
| ----------------- | ------------------- | ------------- |
| Principal limit   | Limit reached       | window reset  |
| Global limit      | Busy right now      | window reset  |
| Blocked (limit 0) | Action unavailable  | none          |

Every message ends with the correlation id, which support hands to a
maintainer.

## Diagnostics

`diagnose({ kind: "maintainer", id })` returns the policy catalog, current usage
per subject (used, effective limit, policy limit, whether overridden, denials
this window, reset time), active overrides and the last 50 denials with their
correlation ids. Any other actor gets `quota_diagnostics_denied`.

Telemetry emits `quota.consume` (success / `quota_exceeded`), `quota.refund`
and `quota.override`. Payloads carry operation, resource, cost, used and limit —
never the principal id.

## Adding a metered operation

1. Add a policy to `QUOTA_POLICIES` with a `rationale`.
2. At the domain boundary, charge it after cheap validation and before the
   expensive work: `store.consume({ operation, principal, cost })`, or wrap the
   work in `withQuota`.
3. Return the error unchanged so the UI can call `describeQuotaError`.
4. Add a row to the table above.

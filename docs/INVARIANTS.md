# Domain Model Invariants Specification

Utix enforces a strict set of domain invariants across all ticketing, access control, and token settlement pathways. These invariants guarantee that the domain state cannot enter impossible, fraudulent, or inconsistent states through any API, UI, worker, or contract execution path.

The invariants are formally defined and verified in [`core/invariants/`](file:///Users/favoureze/utix/core/invariants).

---

## Invariant Catalog

### 1. INV-01: Non-Negative & Capacity-Bounded Supply
- **Rule**: `0 <= event.issuedCount <= event.totalCapacity` and `event.totalCapacity >= 0`.
- **Why it matters**: Prevents overselling venue capacity, negative inventory anomalies, and counterfeit ticket minting.
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L67-L77), [`core/invariants/mutations.ts`](file:///Users/favoureze/utix/core/invariants/mutations.ts#L48-L58).

### 2. INV-02: Single Active Ownership
- **Rule**: A ticket instance has exactly one active owner at any point in time; secondary transfer updates ownership atomically.
- **Why it matters**: Prevents double-spending, duplicate ticket possession, and unauthorized transfers by non-owners.
- **Code Path**: [`core/invariants/mutations.ts`](file:///Users/favoureze/utix/core/invariants/mutations.ts#L121-L131).

### 3. INV-03: Terminal State Immutability
- **Rule**: Tickets in `redeemed`, `expired`, or `burned` states can never transition to any other status or be transferred.
- **Why it matters**: Guarantees that a used ticket cannot be re-sold, re-used at a gate, or resurrected.
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L141-L157).

### 4. INV-04: Valid Sequential Lifecycle Progression
- **Rule**: Transitions must follow valid state transitions: `issued -> transferred/locked -> redeemed/expired/burned`.
- **Why it matters**: Eliminates invalid skips (e.g. unminted to redeemed, or locked to redeemed without unlocking).
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L18-L25).

### 5. INV-05: Escrow / Fraud Lock Transfer Bar
- **Rule**: Any ticket with `status === 'locked'` or `fraudFlag === true` cannot be transferred, redeemed, or settled.
- **Why it matters**: Protects buyers from purchasing disputed, stolen, or chargeback-locked tickets.
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L52-L62), [`core/invariants/mutations.ts`](file:///Users/favoureze/utix/core/invariants/mutations.ts#L142-L151).

### 6. INV-06: Value Conservation & Zero-Sum Fee Split
- **Rule**: `organizerFeeStroops + protocolFeeStroops + sellerProceedsStroops === priceStroops`.
- **Why it matters**: Prevents rounding leaks, fee arbitrage, and unbalanced balance sheets in secondary markets.
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L93-L113), [`core/invariants/mutations.ts`](file:///Users/favoureze/utix/core/invariants/mutations.ts#L162-L171).

### 7. INV-07: Stroop Precision & Positive Bounds
- **Rule**: All monetary figures must be non-negative 64-bit signed integers representing Stellar Stroops ($1\text{ XLM} = 10{,}000{,}000\text{ stroops}$). Floating-point decimals are forbidden.
- **Why it matters**: Prevents precision loss and fractional stroop vulnerabilities.
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L36-L49), [`core/invariants/mutations.ts`](file:///Users/favoureze/utix/core/invariants/mutations.ts#L70-L78).

### 8. INV-08: Timebound Redemption Validity Window
- **Rule**: `validFrom <= validUntil`, and gate redemption at timestamp $T$ requires $\text{validFrom} \le T \le \text{validUntil}$.
- **Why it matters**: Prevents check-in before the event gates open or after the event has concluded.
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L41-L50), [`core/invariants/mutations.ts`](file:///Users/favoureze/utix/core/invariants/mutations.ts#L224-L233).

### 9. INV-09: Nonce & Idempotency Replay Protection
- **Rule**: Each transfer or redemption nonce can be processed at most once across the entire protocol lifecycle.
- **Why it matters**: Prevents replay attacks on signed transfer authorizations and checkout intents.
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L115-L128), [`core/invariants/mutations.ts`](file:///Users/favoureze/utix/core/invariants/mutations.ts#L173-L182).

### 10. INV-10: Organizer Event Solvency & Capacity Conservation
- **Rule**: Sum of all active and redeemed tickets issued for an event must never exceed `event.totalCapacity`.
- **Why it matters**: Guarantees event solvency and prevents physical overbooking emergencies.
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L79-L90).

### 11. INV-11: Blacklisted Principal Action Quarantine
- **Rule**: Any ticket owned by or transfer initiated to/from a blacklisted address must be immediately quarantined.
- **Why it matters**: Complies with anti-fraud controls and prevents sanctioned entities from trading or attending.
- **Code Path**: [`core/invariants/checker.ts`](file:///Users/favoureze/utix/core/invariants/checker.ts#L54-L64), [`core/invariants/mutations.ts`](file:///Users/favoureze/utix/core/invariants/mutations.ts#L60-L69).

---

## Running the Invariant Test Suite

Run the deterministic invariant test suite locally:

```bash
npm test -- core/invariants
```

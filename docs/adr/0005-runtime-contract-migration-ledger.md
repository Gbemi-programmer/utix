# 0005. Enforce the runtime contract states with a shrinking migration ledger

- Status: Accepted
- Date: 2026-09-25
- Sources: commit `7c44fbd` ("feat(verify): check runtime contract states in verify:features", refs #12); `scripts/feature-contract-migration.json`; [FEATURE_CONTRACT.md](../FEATURE_CONTRACT.md) rule 11

## Context

`verify:features` originally checked only file layout: a `__tests__/`
directory proved nothing about whether a slice's loading, error and empty
states worked. Making a behavioural check mandatory at once would have failed
every existing slice and blocked unrelated work.

## Decision

Slice tests drive their states through `renderFeatureSlice` from
`@/core/testing/contract`, which asserts on the `data-contract-state` attribute
the shared primitives render. `verify:features` fails a slice whose tests never
exercise `loading`, `error` and `empty`. Slices that predate the rule are
listed in `scripts/feature-contract-migration.json` and produce a warning
instead of a failure. The checker is itself tested against deliberately good
and bad fixture slices.

## Consequences

- New slices must satisfy the rule from their first pull request.
- The ledger may only shrink; adding a slice to it is never acceptable.
  Migrating one slice and removing it from the ledger is a self-contained
  change.
- Assertions target state attributes, not copy, so the same helpers work for
  structurally different tools.

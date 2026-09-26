# 0001. Build each tool as a self-contained vertical slice

- Status: Accepted
- Date: 2026-08-26 (backfilled 2026-09-25)
- Sources: commit `78ca05f` ("refactor: rebuild RevyHubX as independent vertical feature slices"); [FEATURE_CONTRACT.md](../FEATURE_CONTRACT.md) "Why slices instead of layers"

## Context

Before `78ca05f` the app was organised by layer: pages under
`app/tools/<tool>/page.tsx`, shared components under `components/`, logic under
`lib/stellar/`, one list of tools in `lib/constants.ts`, and every test under a
shared `tests/` tree. Adding a tool meant editing several shared files, so
parallel contributions from many people — the project's publishing model —
conflicted in the same constants, barrels and route files.

## Decision

Every tool is one directory under `features/<slug>/` that owns its logic,
validation, hook, components, copy, tests, fixtures, request mocks, end-to-end
spec and README. `core/` holds only the small shared kernel (Result type,
network, Horizon and RPC clients, UI primitives, layout, testing harness). A
tool pull request touches nothing outside its own directory.

## Consequences

- Two tool pull requests cannot conflict, because they never share a file.
- Some code is repeated across slices instead of shared; a helper moves to
  `core/` only when it is genuinely cross-cutting (see 0006 for an example).
- A change to `core/` affects every tool and is reviewed as such.
- The contract is demanding — a complete slice is 20+ files — and is enforced by
  `npm run verify:features` in CI.

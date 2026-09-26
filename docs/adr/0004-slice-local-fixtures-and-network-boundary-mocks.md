# 0004. Keep fixtures in the slice and mock requests at the network boundary

- Status: Accepted
- Date: 2026-08-26 (backfilled 2026-09-25)
- Sources: commit `78ca05f` ("Vitest with jsdom, Testing Library, MSW and axe-core"); `core/testing/msw.ts`; [FEATURE_CONTRACT.md](../FEATURE_CONTRACT.md) rules 8–9

## Context

Before `78ca05f`, all tests lived in a shared `tests/stellar/` directory and
isolated network calls with `vi.mock`/`vi.fn` on internal modules; there was no
MSW. A shared test directory is another file set every contributor edits, and
mocking internal modules tests the mock rather than the client code that
builds the request and reads the response.

## Decision

Each slice keeps its own `fixtures/` and `msw/handlers.ts` next to the code
they exercise. Requests are intercepted with MSW through `withMswHandlers`
from `@/core/testing/msw`, which fails on any unhandled request. Fixture
addresses are derived from fixed seeds with `Keypair.fromRawEd25519Seed`,
never hand-typed.

## Consequences

- A slice's test data changes with the slice and never collides with another
  slice's.
- Tests run the real request and parsing code, so a wrong URL or a
  mis-read response shape fails the test.
- The same Horizon shape may be described in several slices' fixtures; that
  duplication is accepted in exchange for independence.
- The Horizon client is memoised per network, so a test that swaps handlers
  calls `resetHorizonClients()`.

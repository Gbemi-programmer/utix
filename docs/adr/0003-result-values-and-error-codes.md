# 0003. Return expected failures as `Result` values with coded errors

- Status: Accepted
- Date: 2026-08-26 (backfilled 2026-09-25)
- Sources: commit `78ca05f` ("structured error codes"); `core/result/result.ts`; [FEATURE_CONTRACT.md](../FEATURE_CONTRACT.md) rules 1–3

## Context

Tool logic fails in ways the user can cause or fix — a mistyped address, an
account missing on the selected network, a rate limit — and in ways they
cannot. Thrown exceptions carrying English messages make those cases hard to
tell apart, hard to test and impossible to translate.

## Decision

Slice logic returns `Result<T, Code>` from `@/core/result/result` for every
expected failure and never throws for one. The error *code* is the interface;
each slice maps its codes to user-facing copy in `copy.ts`. Transport failures
are translated into the slice's own codes by `lib/<domain>.errors.ts`.

## Consequences

- Components never see a raw exception, and tests assert on codes rather than
  wording, so copy can change without breaking tests.
- Every new code needs copy that tells the user what to do next; a generic
  `request_failed` is a last resort.
- Distinguishing failures that look alike on the wire (for example a faucet
  "already funded" versus a malformed request, both HTTP 400) is the slice's
  job.

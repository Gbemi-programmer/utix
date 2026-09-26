# 0002. Generate the tool registry and keep it out of git

- Status: Accepted
- Date: 2026-08-26 (backfilled 2026-09-25)
- Sources: commit `78ca05f`; `scripts/generate-registry.mjs`; [ARCHITECTURE.md](../ARCHITECTURE.md) "The generated registry"

## Context

Before `78ca05f`, navigation and the dashboard read a hand-maintained `tools`
array in `lib/constants.ts`, and each tool had its own route file. Every new
tool edited that array, which made it the most-conflicted file in the
repository, and a tool could exist without being listed (or the reverse).

## Decision

`scripts/generate-registry.mjs` scans `features/*/manifest.ts` and writes
`core/registry/{manifests,panels,registry}.generated.ts`. The generated files
are gitignored and rebuilt on `predev`, `prebuild`, `pretest`, `prelint` and
`postinstall`. One dynamic route, `app/tools/[slug]/page.tsx`, serves every
tool. Manifests and panels are generated separately, and panels are loaded
with `next/dynamic`.

## Consequences

- Adding a tool edits no shared file; navigation, dashboard, search and
  `generateStaticParams` pick it up automatically.
- Listing every tool does not bundle every tool's code.
- A fresh clone has no registry until `npm install` or `npm run registry`
  runs, so imports of `@/core/registry/*` fail before that.
- Anything that must cover every tool (for example an end-to-end suite) reads
  the registry instead of keeping its own list.

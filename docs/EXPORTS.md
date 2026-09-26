# Data Export Workflow

`core/export/exporter.ts` is the only sanctioned way to generate structured
exports of operational data. It is privacy-safe by construction:

- **Schema versioning** — every export declares `schemaVersion` (currently
  `1.0`), and generating against an unsupported version fails with
  `schema_unsupported`.
- **Authorization** — exports are scoped. A plain `user` actor may only export
  `scope: "own"` records; `scope: "maintainer"` requires a maintainer actor.
  Anything else returns `export_denied` and records are filtered so a user
  never sees maintainer-only sources.
- **Retention** — every envelope carries `expiresAt`
  (`generatedAt + EXPORT_DEFAULT_TTL_MS`, override with `ttlMs`). Check
  `isExportExpired(envelope)` before serving a stored artifact.
- **Redaction** — secret-shaped values (`S…`/`M…` seeds, keys named
  `secret`/`seed`/`key`/`token`) become `[REDACTED]` before emission.
- **Idempotency** — pass `idempotencyKey` and a retried request replays the
  recorded envelope instead of minting a second artifact. See
  [IDEMPOTENCY.md](./IDEMPOTENCY.md).

## Generating an export

```ts
import { exportRecords, EXPORT_CURRENT_SCHEMA_VERSION } from "@/core/export/exporter";

const result = exportRecords(
  {
    schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION,
    scope: "own",
    actor: { kind: "user" },
    pageSize: 100,
    page: 1,
    // Optional, but required for any caller that can retry: a repeated request
    // with the same key returns this same envelope.
    idempotencyKey: "export:demo:1"
  },
  mySources // ExportRecordSource[]
);
```

For consumers that page through changing collections, pass the returned
`nextCursor` on the next request instead of calculating an offset:

```ts
const next = exportRecords(
  { ...request, pageSize: 100, cursor: first.value.nextCursor ?? undefined },
  mySources
);
```

The cursor is anchored to a record key, so inserting records before the
anchor does not repeat the current page. The legacy `page` field remains
available for offset-based callers. Filtering by authorization happens before
cursor keys are generated, so a cursor cannot cross an authorization scope.

A source supplies records and declares its own scope:

```ts
const source = {
  recordType: "operation_log",
  schemaVersion: EXPORT_CURRENT_SCHEMA_VERSION,
  scope: "own",
  collect: () => telemetryEvents
};
```

## Testing

`npm run test` covers large exports (5 000 records, paged without loss), empty
exports, denied (`export_denied`) and unsupported-version exports, redaction,
and retention expiry — see `core/export/__tests__/exporter.test.ts`.

Each export emits `export.generate` and `export.authorize` telemetry; see
[docs/TELEMETRY.md](./TELEMETRY.md).
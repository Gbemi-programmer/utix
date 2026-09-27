# Contract Event Viewer

Fetches the events a Soroban contract emitted over a ledger range and decodes
every topic and value from base64 `ScVal` into readable text.

## How it works

One Soroban RPC method does the work: `getEvents`, filtered to
`{ type: "contract", contractIds: [id] }`.

- **Start ledger is optional.** Left blank, the tool asks `getLatestLedger`
  first and reads the last 1,000 ledgers (about 80 minutes). RPC nodes only
  retain around seven days of events, so a start ledger outside that window is
  reported as `ledger_out_of_range`, not as a generic failure. The RPC signals
  this only through its error message, which `contractEvents.errors.ts` matches.
- **End ledger is exclusive**, as `getEvents` defines it. The summary shows the
  inclusive range actually searched (`start → end - 1`) so the numbers match
  what an explorer shows.
- **Pagination follows the cursor** up to five pages of 100 events. The first
  request is addressed by ledger and later ones by cursor only — the RPC
  rejects a request carrying both. Cursor pages can run past the end ledger,
  so events at or beyond it are dropped client-side. If every page came back
  full, the result is marked truncated and the UI asks for a narrower range
  rather than silently hiding the rest.

## Decoding

`lib/format.ts` renders each `ScVal` as compact, JSON-like text:

| ScVal | Rendered as |
| --- | --- |
| `Symbol` | bare identifier — `transfer` |
| `String` | quoted — `"native"` |
| `U64` … `I256` | exact decimal, via `bigint` — never a float |
| `Bytes` | `0x…` hex |
| `Address` | `G…` / `C…` StrKey, so it can be pasted into other tools |
| `Vec` / `Map` | `[a, b]` / `{k: v}`, recursively, cut off past depth 8 |
| `Error` | `Error(Contract, 3)` |

A value that fails to decode is **still shown**, as its raw base64 with a note,
so one malformed topic never hides the rest of the event. The first topic is
conventionally the event name; when it is a symbol or string it becomes the
event's heading.

Events emitted by a call that later failed (`inSuccessfulContractCall: false`)
are shown with a warning badge rather than filtered out — they explain what a
failed invocation got as far as doing.

## Safety

Read-only. Input is a contract ID; anything starting with `S` is rejected on
the prefix alone before any parsing, is never rendered back, and never leaves
the browser. Account addresses (`G…`/`M…`) get their own error pointing at the
difference between accounts and contracts.

Results are tagged with the network they came from, so switching networks
clears them instead of showing testnet events under a mainnet label.

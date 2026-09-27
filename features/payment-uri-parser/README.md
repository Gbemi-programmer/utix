# SEP-0007 Payment URI Parser

Parse, decode, and validate SEP-0007 `web+stellar:` payment request and transaction envelope links locally in your browser.

## How it works

The parser processes `web+stellar:pay` and `web+stellar:tx` URIs purely on the client side without making any network requests. It unpacks all query parameters, validates destination addresses, amounts, asset specifications, memo constraints, origin domains, and signatures against the SEP-0007 specification, and flags any syntax errors or unrecognized parameters.

## Files

| Path | Responsibility |
| --- | --- |
| `manifest.ts` | Registry metadata |
| `schema.ts` | URI input validation and secret key detection |
| `lib/` | SEP-0007 parser engine, parameter explanations, and formatters |
| `hooks/` | React state machine for local URI parsing |
| `components/` | Form, parameter inspection table, empty and error UI |
| `__tests__/` | Unit, hook, component and accessibility tests |
| `fixtures/` | Deterministic sample URIs for testing |
| `msw/` | Request mocks (empty for offline tools) |

## Safety

This tool is entirely offline and executes client-side in the browser. It never asks for, accepts, displays, stores, or transmits secret keys. Any input containing a Stellar secret seed is immediately rejected with a security alert.

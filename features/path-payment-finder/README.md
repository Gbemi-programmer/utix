# Path Payment Route Finder

Find the routes Stellar's decentralised exchange offers between two assets, for both strict-send and strict-receive, and inspect the hops and effective rates for each route.

## How it works

Queries Stellar Horizon's `/paths/strict-send` or `/paths/strict-receive` endpoints to discover viable trade routes across order books and liquidity pools between a source asset and destination asset. Each route details the source amount required, destination amount received, intermediate hops (assets traversed), and the resulting effective exchange rate.

## Files

| Path | Responsibility |
| --- | --- |
| `manifest.ts` | Registry metadata |
| `schema.ts` | Input parsing, asset specification and validation |
| `lib/` | Horizon path payment routing queries, normalization, and formatting |
| `hooks/` | React state machine for asynchronous path finding |
| `components/` | Form, result, empty and error UI |
| `__tests__/` | Unit, hook, component and accessibility tests |
| `fixtures/` | Deterministic sample data for routes and endpoints |
| `msw/` | Request mocks for Horizon `/paths/*` calls |

## Safety

This tool queries public decentralized exchange order books and path-payment routing endpoints on the Stellar network. It operates exclusively with public asset codes and issuer account addresses. It never requests, accepts, displays, stores, or transmits secret keys or private credentials.

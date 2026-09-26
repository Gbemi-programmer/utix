# 0006. Parse and format amounts and dates through `core/format`

- Status: Accepted
- Date: 2026-09-25
- Sources: issue #37; [FEATURE_CONTRACT.md](../FEATURE_CONTRACT.md) rule 4

## Context

Rule 4 of the contract already required exact `BigInt` amount arithmetic, but
each slice implemented it separately: more than a dozen copies of
`formatAmount`/`amountToStroops`, several with different grouping, sign and
validation behaviour; where they grouped digits, they hard-coded `,` grouping
and `.` decimals. Dates were
rendered by hand as ISO strings, except one slice that used the browser's local
time zone. `Intl.NumberFormat` cannot simply be applied to an amount string:
by default it rounds to three fraction digits, and engines without
string-decimal support convert the string to a double first.

## Decision

`core/format/amount.ts` is the only place amounts are parsed and formatted.
Input accepts one locale-independent grammar (`.` as the only decimal
separator, at most seven decimals) and rejects any grouping character with
`grouping_separator` instead of guessing its meaning. Display groups the whole
part with `Intl.NumberFormat` on a `BigInt` and appends the fraction digits
through the locale's decimal separator and digit shapes, so no digit is ever
rounded. `core/format/date.ts` formats dates with `Intl.DateTimeFormat` in the
user's locale, fixed to UTC and always labelled.

## Consequences

- Amount display follows the user's locale in every slice, with full
  seven-decimal precision.
- A user who types `1,5` or `1.234,5` is told to write `1234.5`; a payment
  amount is never guessed.
- This changes the contract (rule 4), so it is recorded here per the ADR
  process.
- Integer counts that are not amounts (byte sizes, character limits) keep
  their existing formatting.

# Payment QR Generator

Builds a [SEP-0007](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md)
`web+stellar:pay` request and renders it as a QR code. Everything happens in
the browser; nothing is transmitted and no funds move.

## How it works

`buildPaymentUri` writes the SEP-0007 parameters in a fixed order, so two
identical requests always produce a byte-identical URI and therefore an
identical QR image. `parsePaymentUri` reads one back, which is what the
round-trip tests use.

The QR is rendered as **inline SVG**, not a canvas data URL. SVG stays sharp at
any size, needs no `canvas` implementation (so it behaves identically in jsdom
and in the browser), and leaves the payload inspectable instead of hidden in a
base64 blob.

## Validation rules worth knowing

- **Amount precision** is capped at 7 decimal places, because that is the
  precision the ledger itself stores (1 stroop = 0.0000001).
- **Memo length is measured in bytes, not characters.** A Stellar text memo
  holds 28 bytes; ten rocket emoji are 10 characters but 40 bytes. The tests
  assert exactly this case.
- **`msg`** — the message a wallet shows the payer — is capped at 300
  characters by SEP-0007.

Every validation failure names the field that caused it, so the error is
rendered against the right input rather than in an anonymous banner.

## Safety

This tool creates a *request*. It never moves funds, never asks for a secret
key, and the payer's wallet still has to approve and sign the payment.

## Accessibility & Focus Management

- **Dynamic Field Reveal**: Switching the asset type to an issued asset dynamically reveals the asset code, issuer account, and optional limit fields wrapped within an accessible `<fieldset>` grouping (`aria-label="Issued asset details"`).
- **Predictable Focus Transitions**:
  - Selecting "Issued asset" smoothly shifts focus directly to the revealed `Asset code` input so keyboard and screen-reader users can immediately begin entering asset parameters without tab-navigation disorientation.
  - Switching back to "Native XLM" cleanly returns focus to the `Asset kind` selector, preventing focus loss to `<body>`.
  - Focus transitions are strictly bound to discrete user interactions (`useDynamicRevealFocus`) and are never triggered on background re-renders or typing in other fields.
- **Screen-Reader Announcements**:
  - Dynamically revealed sections announce their group context via accessible fieldset labelling.
  - Form validation errors and live status updates use `role="status"` and `aria-live="polite"` regions so assistive technology alerts users to state transitions without interrupting keyboard flows.

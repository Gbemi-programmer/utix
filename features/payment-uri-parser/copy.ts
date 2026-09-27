export const copy = {
  title: "SEP-0007 Payment URI Parser",
  description:
    "Paste a web+stellar: URI and see every parameter decoded, validated and explained, for both pay and tx operations.",
  emptyTitle: "Paste a SEP-0007 URI",
  emptyDescription:
    "Paste any web+stellar:pay or web+stellar:tx link to inspect its operation, decode parameters, check signatures, and identify errors.",
  formLabel: "SEP-0007 URI",
  formHint: "Starts with web+stellar:pay?... or web+stellar:tx?...",
  formPlaceholder: "web+stellar:pay?destination=G...&amount=10",
  submit: "Parse URI",
  loading: "Parsing...",
  resultTitle: "Parsed URI Parameters",
  operationHeader: "Operation",
  statusHeader: "Status",
  summaryHeader: "Summary",
  paramKeyHeader: "Parameter",
  paramValueHeader: "Decoded Value",
  paramStatusHeader: "Status",
  paramMeaningHeader: "Meaning & Validation",
  validBadge: "Valid",
  warningBadge: "Warning",
  errorBadge: "Error",
  infoBadge: "Info",
  validSummary: "URI is valid according to SEP-0007 specifications.",
  invalidSummary: "URI contains validation errors or missing mandatory parameters.",
  errors: {
    empty_input: "Please enter a web+stellar: URI to parse.",
    invalid_scheme: "The URI scheme must begin with web+stellar:.",
    unknown_operation: "Unknown SEP-0007 operation. Expected 'pay' or 'tx'.",
    invalid_uri: "Malformed URI could not be parsed.",
    secret_key_detected: "Security Alert: Secret key detected! Never embed or share secret keys in URIs."
  }
};

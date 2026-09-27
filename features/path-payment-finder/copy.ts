export const copy = {
  title: "Path Payment Route Finder",
  description:
    "Find the routes Stellar's decentralised exchange offers between two assets, for both strict-send and strict-receive, and show the hops and effective rate for each.",
  emptyTitle: "Find Path Payment Routes",
  emptyDescription:
    "Enter a source asset, destination asset, and amount to discover available DEX conversion paths, intermediate hops, and effective rates.",
  modeLabel: "Path Payment Mode",
  strictSend: "Strict Send (Send exact amount)",
  strictReceive: "Strict Receive (Receive exact amount)",
  amountLabel: "Amount",
  amountHint: "Amount to send (strict-send) or receive (strict-receive)",
  sourceHeading: "Source Asset",
  destHeading: "Destination Asset",
  assetCodeLabel: "Asset Code",
  assetIssuerLabel: "Issuer Account ID (leave blank for XLM)",
  submit: "Find Routes",
  loading: "Searching Routes...",
  resultTitle: "Discovered Routes",
  noRoutesTitle: "No Routes Available",
  noRoutesDescription:
    "The Stellar DEX does not currently offer an exchange path between these assets for the requested amount.",
  sourceAmountHeader: "Source Amount",
  destAmountHeader: "Destination Amount",
  hopsHeader: "Hops",
  effectiveRateHeader: "Effective Rate",
  directRoute: "Direct (0 hops)",
  hopsCount: (count: number) => (count === 1 ? "1 hop" : `${count} hops`),
  errors: {
    invalid_input: "Please check your asset codes, issuer addresses, and amount.",
    no_routes_found: "No conversion routes found for this pair and amount.",
    rate_limited: "Horizon rate limit exceeded. Please wait a moment.",
    request_failed: "Unable to query route information from Horizon."
  }
};

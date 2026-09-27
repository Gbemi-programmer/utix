export const spec = {
  route: "/tools/contract-events",
  steps: [
    { action: "visit", target: "/tools/contract-events" },
    { action: "expect", target: "heading", value: "Contract Event Viewer" },
    { action: "expect", target: "text", value: "No events fetched yet" },
    { action: "fill", target: "Contract ID", value: "<C… contract ID>" },
    { action: "click", target: "Fetch events" },
    { action: "expect", target: "list", value: "Events" },
    { action: "switchNetwork", value: "mainnet" },
    { action: "expect", target: "text", value: "No events fetched yet" }
  ]
} as const;

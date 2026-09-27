import { Link2 } from "lucide-react";
import type { FeatureManifest } from "@/core/registry/types";

export const manifest: FeatureManifest = {
  slug: "payment-uri-parser",
  title: "SEP-0007 Payment URI Parser",
  description:
    "Paste a web+stellar: URI and see every parameter decoded, validated and explained, for both pay and tx operations.",
  character: "A URI inspector unpacks Stellar payment and transaction links right in your browser.",
  category: "payments",
  status: "working",
  icon: Link2,
  networks: [],
  offline: true,
  keywords: [
    "sep-0007",
    "web+stellar",
    "pay",
    "tx",
    "uri",
    "parser",
    "validator",
    "offline"
  ]
};

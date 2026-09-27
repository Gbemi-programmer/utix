import { Route } from "lucide-react";
import type { FeatureManifest } from "@/core/registry/types";

export const manifest: FeatureManifest = {
  slug: "path-payment-finder",
  title: "Path Payment Route Finder",
  description:
    "Find the routes Stellar's decentralised exchange offers between two assets, for both strict-send and strict-receive, and show the hops and effective rate for each.",
  character: "A route explorer charts paths through Stellar DEX order books and liquidity pools.",
  category: "payments",
  status: "working",
  icon: Route,
  networks: ["testnet", "mainnet"],
  keywords: [
    "path-payment",
    "strict-send",
    "strict-receive",
    "dex",
    "liquidity-pool",
    "swap",
    "routing"
  ]
};

import { History } from "lucide-react";
import type { FeatureManifest } from "@/core/registry/types";

export const manifest: FeatureManifest = {
  slug: "payment-history",
  title: "Account Payment History",
  description:
    "Browse the payments in and out of an account, with direction, counterparty, asset and amount, and cursor-based paging.",
  character: "Every payment tells a story, and this is where it starts.",
  category: "payments",
  status: "beta",
  icon: History,
  networks: ["testnet", "mainnet"],
  keywords: ["payments", "history", "account", "transfers", "horizon"]
};

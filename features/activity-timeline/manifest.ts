import { Activity } from "lucide-react";
import type { FeatureManifest } from "@/core/registry/types";

export const manifest: FeatureManifest = {
  slug: "activity-timeline",
  title: "Record Activity Timeline",
  description:
    "Read the ticket, event and fraud-control activity recorded for an account as a filtered, paginated timeline — with maintainer-only audit context kept out of sight.",
  character: "A gatekeeper who stamps every ticket but only tells the holder what they are allowed to know.",
  category: "accounts",
  status: "working",
  icon: Activity,
  networks: ["testnet", "mainnet"],
  keywords: [
    "activity",
    "timeline",
    "ticket",
    "event",
    "fraud",
    "visibility",
    "audit",
    "paging",
    "history"
  ]
};

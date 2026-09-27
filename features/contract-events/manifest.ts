import { Radio } from "lucide-react";
import type { FeatureManifest } from "@/core/registry/types";

export const manifest: FeatureManifest = {
  slug: "contract-events",
  title: "Contract Event Viewer",
  description:
    "Fetch the events a Soroban contract emitted over a ledger range and read their topics and values decoded from ScVal.",
  character: "A radio operator tunes into one contract and transcribes everything it broadcast.",
  category: "soroban",
  status: "beta",
  icon: Radio,
  networks: ["testnet", "mainnet"],
  keywords: ["soroban", "contract", "events", "getEvents", "topics", "scval", "rpc", "ledger"]
};

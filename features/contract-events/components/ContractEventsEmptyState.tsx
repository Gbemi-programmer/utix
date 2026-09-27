import { Radio } from "lucide-react";
import { EmptyState } from "@/core/ui/EmptyState";
import { copy } from "@/features/contract-events/copy";

export function ContractEventsEmptyState() {
  return <EmptyState icon={Radio} title={copy.emptyTitle} description={copy.emptyDescription} />;
}

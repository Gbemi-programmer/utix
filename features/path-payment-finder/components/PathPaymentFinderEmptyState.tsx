import { Route } from "lucide-react";
import { EmptyState } from "@/core/ui/EmptyState";
import { copy } from "@/features/path-payment-finder/copy";

export function PathPaymentFinderEmptyState() {
  return (
    <EmptyState
      icon={Route}
      title={copy.emptyTitle}
      description={copy.emptyDescription}
    />
  );
}

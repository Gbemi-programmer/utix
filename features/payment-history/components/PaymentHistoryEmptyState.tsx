import { History } from "lucide-react";
import { EmptyState } from "@/core/ui/EmptyState";
import { copy } from "@/features/payment-history/copy";

export function PaymentHistoryEmptyState() {
  return (
    <EmptyState
      icon={History}
      title={copy.emptyTitle}
      description={copy.emptyDescription}
    />
  );
}

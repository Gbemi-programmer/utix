import { Link2 } from "lucide-react";
import { EmptyState } from "@/core/ui/EmptyState";
import { copy } from "@/features/payment-uri-parser/copy";

export function PaymentUriParserEmptyState() {
  return (
    <EmptyState
      icon={Link2}
      title={copy.emptyTitle}
      description={copy.emptyDescription}
    />
  );
}

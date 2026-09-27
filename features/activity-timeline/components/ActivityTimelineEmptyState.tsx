import { Activity } from "lucide-react";
import { EmptyState } from "@/core/ui/EmptyState";
import { copy } from "@/features/activity-timeline/copy";

export function ActivityTimelineEmptyState() {
  return (
    <EmptyState icon={Activity} title={copy.emptyTitle} description={copy.emptyDescription} />
  );
}

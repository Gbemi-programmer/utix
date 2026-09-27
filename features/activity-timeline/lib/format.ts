import { truncateMiddle } from "@/core/lib/strings";
import { copy } from "@/features/activity-timeline/copy";
import type { ActivityActor, ActivityEventType } from "@/features/activity-timeline/types";

export { formatDateTime as formatTimestamp } from "@/core/format/date";

/** Event types read as sentences; `copy` owns the exact wording. */
export function formatActivityType(type: ActivityEventType): string {
  return copy.eventTypeLabels[type];
}

/** Actors render as `kind:id`, with the id middle-truncated like an address. */
export function formatActor(actor: ActivityActor): string {
  return `${actor.kind}:${truncateMiddle(actor.id, 6)}`;
}

/** Transaction hashes render middle-truncated, in a monospace face. */
export function formatTransactionHash(hash: string): string {
  return truncateMiddle(hash, 8);
}

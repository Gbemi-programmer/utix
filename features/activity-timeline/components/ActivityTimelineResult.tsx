import { Card, CardDescription, CardHeader, CardTitle } from "@/core/ui/Card";
import { Badge } from "@/core/ui/Badge";
import { CopyableValue } from "@/core/ui/CopyableValue";
import { DataList } from "@/core/ui/DataList";
import { StatusMessage } from "@/core/ui/StatusMessage";
import { cn } from "@/core/lib/cn";
import { copy } from "@/features/activity-timeline/copy";
import {
  formatActivityType,
  formatActor,
  formatTimestamp,
  formatTransactionHash
} from "@/features/activity-timeline/lib/format";
import type {
  ActivityEvent,
  ActivityEventCategory,
  ActivityTimelinePage,
  RecordState
} from "@/features/activity-timeline/types";

/**
 * The four categories are told apart by a written badge as well as by colour,
 * because colour on its own carries no meaning for a screen reader and none
 * for a reader who cannot distinguish the hues.
 */
const categoryStyles: Record<ActivityEventCategory, string> = {
  ticket: "border-l-[#70c7a7] bg-[#f2fbf7]",
  event: "border-l-[#82cbe3] bg-[#f0f9fd]",
  fraud: "border-l-[#ffc3a8] bg-[#fff6ef]",
  record: "border-l-[#c7b9f3] bg-[#f7f5ff]"
};

const categoryTones: Record<ActivityEventCategory, "success" | "info" | "warning" | "muted"> = {
  ticket: "success",
  event: "info",
  fraud: "warning",
  record: "muted"
};

/** Record states that gate visibility get a badge saying exactly that. */
const stateTones: Record<RecordState, "muted" | "warning" | "error"> = {
  active: "muted",
  restricted: "warning",
  deleted: "error"
};

function EventCard({ event }: { event: ActivityEvent }) {
  return (
    <li
      className={cn(
        "rounded-md border border-[#e3ebf5] border-l-4 px-3 py-2",
        categoryStyles[event.category]
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={categoryTones[event.category]}>{copy.categoryLabels[event.category]}</Badge>
        <span className="text-sm font-bold text-[#172033]">{formatActivityType(event.type)}</span>
        {event.visibility === "maintainer" ? (
          <Badge tone="muted">{copy.maintainerBadge}</Badge>
        ) : null}
        {event.subject.state !== "active" ? (
          <Badge tone={stateTones[event.subject.state]}>
            {event.subject.state === "deleted" ? copy.deletedBadge : copy.restrictedBadge}
          </Badge>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-[#172033]">{event.summary}</p>

      <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <dt className="text-xs font-bold uppercase tracking-wide text-[#4e5c73]">
            {copy.actorLabel}
          </dt>
          <dd className="font-mono text-xs text-[#172033]">{formatActor(event.actor)}</dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <dt className="text-xs font-bold uppercase tracking-wide text-[#4e5c73]">
            {copy.subjectLabel}
          </dt>
          <dd className="font-mono text-xs text-[#172033]">
            {event.subject.kind}:{event.subject.id}
          </dd>
        </div>
      </dl>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label={copy.timelineLabel}>
        {event.links.map((link) => (
          <li key={link.kind}>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold text-[#146783] underline underline-offset-2"
            >
              {link.kind === "transaction"
                ? `${copy.transactionLinkLabel} · ${formatTransactionHash(event.transactionHash)}`
                : copy.recordLinkText}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-[#68758a]">{formatTimestamp(event.at)}</p>
    </li>
  );
}

export function ActivityTimelineResult({ page }: { page: ActivityTimelinePage }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{copy.summaryTitle}</CardTitle>
          <CardDescription>{copy.visibilityNote}</CardDescription>
        </CardHeader>
        <DataList
          items={[
            {
              label: copy.accountLabel,
              value: <CopyableValue label={copy.accountLabel} value={page.accountId} />
            },
            { label: copy.eventsOnPageLabel, value: String(page.events.length) },
            { label: copy.totalVisibleLabel, value: String(page.total) }
          ]}
        />
      </Card>

      {page.events.length === 0 ? (
        <StatusMessage
          type="info"
          title={page.total === 0 ? copy.noEventsTitle : copy.noMatchesTitle}
          description={page.total === 0 ? copy.noEventsDescription : copy.noMatchesDescription}
        />
      ) : (
        <ol className="space-y-4" aria-label={copy.timelineLabel}>
          {page.events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </ol>
      )}
    </div>
  );
}

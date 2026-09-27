/**
 * The activity timeline query: normalization, visibility, ordering, paging.
 *
 * The visibility rules live here, at the domain boundary, so no caller — not
 * the hook, not a component, not a future route — can render an event the
 * actor is not authorized to see. The rules:
 *
 * 1. A `maintainer` actor sees every event, whatever its visibility or its
 *    record state. Operator context is theirs to review.
 * 2. A `user` actor never sees a `maintainer`-visibility event, even one they
 *    caused or one about their own record.
 * 3. A `user` actor never sees an event about a `deleted` record — the record
 *    it describes no longer exists, so its history is not public.
 * 4. A `user` actor sees an event about a `restricted` record only when they
 *    own that record. A stranger does not.
 * 5. Anything else — a `public` event on an `active` record — is visible to
 *    everyone.
 *
 * A `system` actor is not a viewer: the timeline is a person's view of their
 * activity, and the system's own bookkeeping is the audit trail's business.
 *
 * Ordering is a total order — `at` descending, then `id` descending — so a
 * page boundary never depends on the order events arrived in, and a cursor
 * saved today still anchors to the same event after new activity lands.
 */

import { err, ok, type Result } from "@/core/result/result";
import { paginateByCursor } from "@/core/pagination/cursor";
import type { StellarNetwork } from "@/core/network/types";
import { copy } from "@/features/activity-timeline/copy";
import { toActivityTimelineErrorCode } from "@/features/activity-timeline/lib/activityTimeline.errors";
import type {
  ActivityEvent,
  ActivityEventCategory,
  ActivityEventType,
  ActivityTimelineErrorCode,
  ActivityTimelineInput,
  ActivityTimelinePage,
  ActivityTimelineRequest,
  ActivityTypeFilter,
  RecordState
} from "@/features/activity-timeline/types";

/** Visible events per page. */
export const PAGE_SIZE = 10;

/** The origin of the Utix activity API, mocked at the network boundary. */
export const ACTIVITY_API_ORIGIN = "https://api.utix.example";

/** Explorer base for the stable, shareable links every event carries. */
const EXPLORER_BASE = "https://stellar.expert/explorer";

export const ACTIVITY_EVENT_TYPES = [
  "ticket.issued",
  "ticket.transferred",
  "ticket.redeemed",
  "event.created",
  "event.updated",
  "event.cancelled",
  "fraud.flag_raised",
  "fraud.flag_cleared",
  "fraud.hold_placed",
  "fraud.hold_released",
  "record.deleted",
  "record.restricted"
] as const satisfies readonly ActivityEventType[];

export const ACTIVITY_TYPE_CATEGORIES: Record<ActivityEventType, ActivityEventCategory> = {
  "ticket.issued": "ticket",
  "ticket.transferred": "ticket",
  "ticket.redeemed": "ticket",
  "event.created": "event",
  "event.updated": "event",
  "event.cancelled": "event",
  "fraud.flag_raised": "fraud",
  "fraud.flag_cleared": "fraud",
  "fraud.hold_placed": "fraud",
  "fraud.hold_released": "fraud",
  "record.deleted": "record",
  "record.restricted": "record"
};

/** Each category's own event types, in timeline order. */
export const CATEGORY_TYPES: Record<ActivityEventCategory, readonly ActivityEventType[]> = {
  ticket: ["ticket.issued", "ticket.transferred", "ticket.redeemed"],
  event: ["event.created", "event.updated", "event.cancelled"],
  fraud: ["fraud.flag_raised", "fraud.flag_cleared", "fraud.hold_placed", "fraud.hold_released"],
  record: ["record.deleted", "record.restricted"]
};

const RECORD_STATES = ["active", "deleted", "restricted"] as const satisfies readonly RecordState[];
const ACTOR_KINDS = ["user", "maintainer", "system"] as const;

function isRecordState(value: string): value is RecordState {
  return (RECORD_STATES as readonly string[]).includes(value);
}

function isActorKind(value: string): value is ActivityEvent["actor"]["kind"] {
  return (ACTOR_KINDS as readonly string[]).includes(value);
}

function isEventType(value: string): value is ActivityEventType {
  return (ACTIVITY_EVENT_TYPES as readonly string[]).includes(value);
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128;
}

/**
 * Whether an actor may see an event.
 *
 * This is the single authorization decision of the timeline. It is a pure
 * function of the event and the actor, so every boundary — the hook, a route,
 * a test — enforces exactly the same rule.
 */
export function isActivityVisibleTo(
  event: Pick<ActivityEvent, "visibility" | "subject">,
  actor: { readonly kind: string; readonly id: string }
): boolean {
  if (actor.kind === "maintainer") return true;
  if (actor.kind !== "user") return false;
  if (event.visibility === "maintainer") return false;
  if (event.subject.state === "deleted") return false;
  if (event.subject.state === "restricted") return actor.id === event.subject.ownerId;
  return true;
}

/**
 * Filters a list of events down to those the actor may see.
 *
 * The API stores every event; it is this function — applied at the query
 * boundary, before anything is rendered — that keeps maintainer-only and
 * deleted-record context out of a user's timeline.
 */
export function filterVisibleEvents<T extends Pick<ActivityEvent, "visibility" | "subject">>(
  events: readonly T[],
  actor: { readonly kind: string; readonly id: string }
): T[] {
  return events.filter((event) => isActivityVisibleTo(event, actor));
}

/** Narrows events to one category. `all` is a no-op. */
export function filterEventsByType<T extends { readonly category: ActivityEventCategory }>(
  events: readonly T[],
  filter: ActivityTypeFilter
): T[] {
  if (filter === "all") return [...events];
  return events.filter((event) => event.category === filter);
}

/**
 * The timeline's total order: newest first, and when two events share an
 * instant, the higher id first.
 *
 * The id tiebreak is what makes paging stable. ISO-8601 instants are compared
 * lexically, which is exact for same-format UTC timestamps, and the id
 * tiebreak decides the rest — so the order never depends on the order the
 * API happened to return.
 */
export function compareActivityEvents(
  left: Pick<ActivityEvent, "at" | "id">,
  right: Pick<ActivityEvent, "at" | "id">
): number {
  if (left.at !== right.at) return left.at > right.at ? -1 : 1;
  if (left.id !== right.id) return left.id > right.id ? -1 : 1;
  return 0;
}

/** Sorts events into the timeline's total order. */
export function sortActivityEvents<T extends Pick<ActivityEvent, "at" | "id">>(
  events: readonly T[]
): T[] {
  return [...events].sort(compareActivityEvents);
}

/**
 * Builds the stable links an event carries: the transaction that carried the
 * action, and the record it concerns.
 *
 * Both are derived from ids alone, never from list positions or timestamps,
 * so a link saved today still resolves after the timeline re-sorts. The
 * transaction link points at the public explorer for the network the history
 * was read from; the record link is the protocol's canonical record URL.
 */
export function buildActivityLinks(
  subject: ActivityEvent["subject"],
  transactionHash: string,
  network: StellarNetwork
): ActivityEvent["links"] {
  return [
    {
      kind: "transaction",
      href: `${EXPLORER_BASE}/${network}/tx/${transactionHash}`,
      label: copy.transactionLinkLabel
    },
    {
      kind: "record",
      href: `${ACTIVITY_API_ORIGIN}/v1/records/${subject.kind}/${subject.id}`,
      label: copy.recordLinkLabel
    }
  ];
}

/**
 * The subset of an activity API record this tool reads. Every field is
 * required: a record missing any of them cannot be rendered honestly, so the
 * whole page is refused rather than showing a partial event.
 */
export interface RawActivityEvent {
  id: string;
  type: string;
  visibility: string;
  actor: { kind: string; id: string };
  subject: { kind: string; id: string; ownerId: string; state: string };
  at: string;
  summary: string;
  transactionHash: string;
}

/**
 * Normalises one API record into an event, or `null` when the record is not
 * shaped like an activity event.
 */
export function normalizeActivityEvent(
  raw: RawActivityEvent,
  network: StellarNetwork
): ActivityEvent | null {
  if (!isLabel(raw?.id) || !isEventType(raw.type)) return null;
  if (raw.visibility !== "public" && raw.visibility !== "maintainer") return null;
  if (!isLabel(raw.summary) || !isLabel(raw.transactionHash)) return null;
  if (!raw.actor || !isActorKind(raw.actor.kind) || !isLabel(raw.actor.id)) return null;
  if (
    !raw.subject ||
    (raw.subject.kind !== "ticket" && raw.subject.kind !== "event") ||
    !isLabel(raw.subject.id) ||
    !isLabel(raw.subject.ownerId) ||
    !isRecordState(raw.subject.state)
  ) {
    return null;
  }
  if (!isLabel(raw.at)) return null;

  const subject: ActivityEvent["subject"] = {
    kind: raw.subject.kind,
    id: raw.subject.id,
    ownerId: raw.subject.ownerId,
    state: raw.subject.state
  };

  return {
    id: raw.id,
    type: raw.type,
    category: ACTIVITY_TYPE_CATEGORIES[raw.type],
    visibility: raw.visibility,
    actor: { kind: raw.actor.kind, id: raw.actor.id },
    subject,
    at: raw.at,
    summary: raw.summary,
    transactionHash: raw.transactionHash,
    links: buildActivityLinks(subject, raw.transactionHash, network)
  };
}

/**
 * Normalises a page of records, refusing the whole page if any record is
 * malformed — a timeline that silently dropped a broken event would show a
 * wrong history.
 */
export function normalizeActivityEvents(
  records: readonly RawActivityEvent[],
  network: StellarNetwork
): Result<ActivityEvent[], ActivityTimelineErrorCode> {
  const events: ActivityEvent[] = [];

  for (const record of records) {
    const event = normalizeActivityEvent(record, network);
    if (!event) return err("request_failed");
    events.push(event);
  }

  return ok(events);
}

interface Collection {
  _embedded?: { records?: RawActivityEvent[] };
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw Object.assign(new Error("Activity request failed."), { status: response.status });
  }
  return (await response.json()) as T;
}

/**
 * The actor whose timeline is being read, when no other is supplied.
 *
 * An anonymous viewer: a `user` with no account id, so they see public events
 * on active records and nothing restricted, deleted or maintainer-only.
 */
export function viewerActor(): ActivityEvent["actor"] {
  return { kind: "user", id: "viewer" };
}

/**
 * Loads one page of the activity timeline for an actor.
 *
 * The API returns the account's events newest-first; this function then
 * applies, in order: the visibility rules (the authorization boundary), the
 * type filter, and the cursor page. The events a caller never sees are
 * filtered out here — they are never stored in hook state, so no later render
 * can leak them.
 */
export async function loadActivityPage(
  { accountId, typeFilter }: ActivityTimelineInput,
  actor: ActivityEvent["actor"],
  network: StellarNetwork,
  request: ActivityTimelineRequest = {}
): Promise<Result<ActivityTimelinePage, ActivityTimelineErrorCode>> {
  try {
    const typeParam =
      typeFilter === "all" ? undefined : CATEGORY_TYPES[typeFilter].join(",");
    const url = new URL(
      `${ACTIVITY_API_ORIGIN}/v1/accounts/${encodeURIComponent(accountId)}/activity`
    );
    // The API accepts a type filter, so the mock serves exactly the events the
    // tool asked for. Visibility filtering stays client-side: the API stores
    // every event, and `filterVisibleEvents` is the authorization boundary.
    if (typeParam) url.searchParams.set("types", typeParam);

    const response = await requestJson<Collection>(url.toString(), request.signal);
    const records = response._embedded?.records ?? [];
    const normalized = normalizeActivityEvents(records, network);
    if (!normalized.ok) return normalized;

    const visible = filterVisibleEvents(normalized.value, actor);
    const matched = filterEventsByType(visible, typeFilter);
    const ordered = sortActivityEvents(matched);

    const page = paginateByCursor(ordered, {
      pageSize: PAGE_SIZE,
      getKey: (event) => event.id,
      cursor: request.cursor
    });

    return ok({
      accountId,
      typeFilter,
      events: page.items,
      total: ordered.length,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor
    });
  } catch (error) {
    return err(toActivityTimelineErrorCode(error));
  }
}

/**
 * Activity events for the Utix ticketing and event access protocol.
 *
 * An activity event is one meaningful thing that happened to an account or to
 * a record the account interacts with: a ticket was issued, transferred or
 * redeemed; an event was created, updated or cancelled; a fraud control moved;
 * a record was restricted or deleted.
 *
 * Every event carries two independent visibility axes, and both are enforced
 * by the query layer (`lib/activityTimeline.ts`) before any event reaches a
 * screen:
 *
 * - `visibility` — who may see the event at all. `public` events describe
 *   protocol activity anyone may read; `maintainer` events carry operator
 *   context (fraud review notes, holds, restrictions) that stays out of the
 *   user-facing timeline.
 * - `subject.state` — the lifecycle state of the record the event concerns.
 *   Events about `deleted` records and events about `restricted` records the
 *   actor does not own are not part of the public timeline either, whatever
 *   the event's own visibility says.
 *
 * The two axes are deliberately separate: a `public` event on a `deleted`
 * record is still not public, because the record it describes no longer
 * exists.
 */

export type ActivityEventType =
  | "ticket.issued"
  | "ticket.transferred"
  | "ticket.redeemed"
  | "event.created"
  | "event.updated"
  | "event.cancelled"
  | "fraud.flag_raised"
  | "fraud.flag_cleared"
  | "fraud.hold_placed"
  | "fraud.hold_released"
  | "record.deleted"
  | "record.restricted";

/** The four groups a reader can filter the timeline by. */
export type ActivityEventCategory = "ticket" | "event" | "fraud" | "record";

export type ActivityVisibility = "public" | "maintainer";

export type RecordState = "active" | "deleted" | "restricted";

export type ActivityActorKind = "user" | "maintainer" | "system";

export interface ActivityActor {
  readonly kind: ActivityActorKind;
  readonly id: string;
}

/** The record an event concerns: a ticket or an event in the protocol. */
export interface ActivitySubject {
  readonly kind: "ticket" | "event";
  readonly id: string;
  /** The account that owns the record. Decides who may see restricted history. */
  readonly ownerId: string;
  readonly state: RecordState;
}

/**
 * A stable, shareable link to a resource the event points at. Links are
 * derived from ids alone — never from list positions or timestamps — so a
 * link saved today still resolves after the timeline re-sorts.
 */
export interface ActivityLink {
  readonly kind: "transaction" | "record";
  readonly href: string;
  readonly label: string;
}

export interface ActivityEvent {
  readonly id: string;
  readonly type: ActivityEventType;
  readonly category: ActivityEventCategory;
  readonly visibility: ActivityVisibility;
  readonly actor: ActivityActor;
  readonly subject: ActivitySubject;
  /** ISO-8601 instant. */
  readonly at: string;
  readonly summary: string;
  /** The transaction that carried the action, as a hex hash. */
  readonly transactionHash: string;
  readonly links: ActivityLink[];
}

/** `all` shows every event the actor is authorized to see. */
export type ActivityTypeFilter = "all" | ActivityEventCategory;

export interface ActivityTimelineInput {
  readonly accountId: string;
  readonly typeFilter: ActivityTypeFilter;
}

export interface ActivityTimelineRequest {
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export interface ActivityTimelinePage {
  readonly accountId: string;
  readonly typeFilter: ActivityTypeFilter;
  /** Visible events, newest first. */
  readonly events: ActivityEvent[];
  /** How many visible events exist in total, across all pages. */
  readonly total: number;
  readonly hasMore: boolean;
  /** Cursor that starts the next, older page. */
  readonly nextCursor: string | null;
}

export type ActivityTimelineField = "accountId";

export type ActivityTimelineErrorCode =
  | "empty_input"
  | "invalid_address"
  | "invalid_filter"
  | "record_not_found"
  | "rate_limited"
  | "request_failed";

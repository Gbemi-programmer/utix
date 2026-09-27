import type {
  ActivityEventCategory,
  ActivityEventType,
  ActivityTimelineErrorCode,
  ActivityTypeFilter,
  RecordState
} from "@/features/activity-timeline/types";

export const copy = {
  formLabel: "Account address",
  formHint:
    "Paste a public Stellar account address starting with G. The timeline is read only — never paste a secret key.",
  formPlaceholder: "GABC...XYZ",
  filterLabel: "Activity filter",
  filterHint: "Narrow the timeline to one kind of activity. Events you are not authorized to see are never returned, whatever the filter.",
  submit: "Show activity timeline",
  loading: "Loading activity...",

  emptyTitle: "No timeline loaded yet",
  emptyDescription:
    "Paste an account address to see the ticket, event and fraud-control activity recorded for it — newest first, across as many pages as there are.",

  summaryTitle: "Activity for this account",
  accountLabel: "Account",
  eventsOnPageLabel: "Events on this page",
  totalVisibleLabel: "Events you can see",
  filteredFromLabel: (visible: number, returned: number) =>
    `${visible} of ${returned} returned events are visible to you.`,

  timelineLabel: "Activity, newest first",
  actorLabel: "Actor",
  subjectLabel: "Record",
  transactionLabel: "Transaction",
  recordLinkLabel: "Record",
  transactionLinkLabel: "View transaction",
  recordLinkText: "View record",

  noEventsTitle: "No activity recorded for this account",
  noEventsDescription:
    "The account exists on the selected network but has no recorded activity. Check the network switch in the header if you expected history here.",

  noMatchesTitle: "Nothing on this page matches the filter",
  noMatchesDescription:
    "The filter hid every event on this page. Clear the filter or page back to see the rest of the timeline.",

  visibilityNote:
    "Maintainer-only audit context — fraud review notes, holds and restrictions — is kept out of this timeline. Those events stay in the audit trail.",

  restrictedBadge: "Restricted record",
  deletedBadge: "Deleted record",
  maintainerBadge: "Maintainer only",

  typeFilterLabels: {
    all: "All activity",
    ticket: "Tickets",
    event: "Events",
    fraud: "Fraud controls",
    record: "Record administration"
  } satisfies Record<ActivityTypeFilter, string>,

  categoryLabels: {
    ticket: "Ticket",
    event: "Event",
    fraud: "Fraud control",
    record: "Record administration"
  } satisfies Record<ActivityEventCategory, string>,

  recordStateLabels: {
    active: "Active",
    deleted: "Deleted",
    restricted: "Restricted"
  } satisfies Record<RecordState, string>,

  eventTypeLabels: {
    "ticket.issued": "Ticket issued",
    "ticket.transferred": "Ticket transferred",
    "ticket.redeemed": "Ticket redeemed",
    "event.created": "Event created",
    "event.updated": "Event updated",
    "event.cancelled": "Event cancelled",
    "fraud.flag_raised": "Fraud flag raised",
    "fraud.flag_cleared": "Fraud flag cleared",
    "fraud.hold_placed": "Hold placed",
    "fraud.hold_released": "Hold released",
    "record.deleted": "Record deleted",
    "record.restricted": "Record restricted"
  } satisfies Record<ActivityEventType, string>,

  pagerLabel: "Timeline paging",
  newerPage: "Newer activity",
  olderPage: "Older activity",
  pagePosition: (pageNumber: number) => `Page ${pageNumber}`,
  atNewestEnd: "You are on the newest page.",
  atOldestEnd: "You have reached the oldest recorded activity.",
  pageSizeNote: (size: number) => `Up to ${size} events per page, newest first.`
} as const;

export const errorCopy: Record<
  ActivityTimelineErrorCode,
  { title: string; description: string }
> = {
  empty_input: {
    title: "Enter an account address",
    description:
      "Paste a public Stellar address starting with G to load the activity recorded for it."
  },
  invalid_address: {
    title: "That is not a valid account address",
    description:
      "The value failed Stellar's checksum check. Confirm it starts with G, was copied in full, and is not a secret key — this tool never accepts one."
  },
  invalid_filter: {
    title: "That activity filter is not recognised",
    description: "Choose one of the filter options: all activity, tickets, events, fraud controls or record administration."
  },
  record_not_found: {
    title: "This account has no activity on the selected network",
    description:
      "Check the network switch in the header: a testnet account has no history on mainnet, and the reverse is also true."
  },
  rate_limited: {
    title: "The activity service is rate limiting this request",
    description: "Wait a moment before loading another page of activity."
  },
  request_failed: {
    title: "Could not load the activity timeline",
    description:
      "The activity service did not return a usable page. Check your connection and try again."
  }
};

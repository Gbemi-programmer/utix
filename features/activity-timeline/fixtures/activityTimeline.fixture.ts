import { Keypair } from "@stellar/stellar-sdk";
import type { RawActivityEvent } from "@/features/activity-timeline/lib/activityTimeline";
import type {
  ActivityEventType,
  ActivityVisibility,
  RecordState
} from "@/features/activity-timeline/types";

const seed = (byte: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte));

export const accountId = seed(41).publicKey();
export const quietAccountId = seed(42).publicKey();
export const unknownAccountId = seed(43).publicKey();
export const restrictedOwnerId = seed(44).publicKey();
export const secretSeed = seed(45).secret();

/** Tickets and events the fixture history refers to. */
export const ticketId = "tkt-0001";
export const foreignTicketId = "tkt-0002";
export const flaggedTicketId = "tkt-0003";
export const heldTicketId = "tkt-0004";
export const restrictedTicketId = "tkt-0006";
export const foreignRestrictedTicketId = "tkt-0007";
export const deletedTicketId = "tkt-0005";
export const eventId = "evt-0001";

/**
 * A deterministic stand-in for a transaction hash: 32 seed bytes as hex, the
 * shape of a real Stellar hash without hand-typing 64 characters.
 */
function txHash(byte: number): string {
  return Buffer.alloc(32, byte).toString("hex");
}

const BASE = Date.parse("2026-04-01T00:00:00Z");
const MINUTE = 60_000;

function at(minute: number): string {
  return new Date(BASE + minute * MINUTE).toISOString();
}

interface Subject {
  readonly kind: "ticket" | "event";
  readonly id: string;
  readonly ownerId: string;
  readonly state: RecordState;
}

const ACTIVE_ACCOUNT = { kind: "ticket", ownerId: accountId, state: "active" } as const;

function subject(
  kind: "ticket" | "event",
  id: string,
  overrides: Partial<Subject> = {}
): Subject {
  return { ...ACTIVE_ACCOUNT, kind, id, ...overrides };
}

/**
 * Builds one raw API record. Ids are explicit and zero-padded so a test can
 * name the exact event it means, and so the id tiebreak orders them
 * numerically.
 */
function event(
  seq: number,
  type: ActivityEventType,
  visibility: ActivityVisibility,
  subject: Subject,
  minute: number,
  summary: string
): RawActivityEvent {
  return {
    id: `act-${String(seq).padStart(4, "0")}`,
    type,
    visibility,
    actor: { kind: "system", id: "protocol" },
    subject,
    at: at(minute),
    summary,
    transactionHash: txHash(seq)
  };
}

const T = subject("ticket", "tkt-0001");
const T2 = subject("ticket", "tkt-0002");
const T3 = subject("ticket", "tkt-0003");
const T4 = subject("ticket", "tkt-0004");
const T5 = subject("ticket", "tkt-0005", { state: "deleted" });
const T6 = subject("ticket", "tkt-0006", { state: "restricted" });
const T7 = subject("ticket", "tkt-0007", {
  ownerId: restrictedOwnerId,
  state: "restricted"
});
const E1 = subject("event", "evt-0001");
const E2 = subject("event", "evt-0002");
const E3 = subject("event", "evt-0003");

/**
 * Thirty-six events of protocol history, oldest first.
 *
 * The set covers every event type, both visibility classes and all three
 * record states, so the visibility rules, the type filter and the pager each
 * have something real to bite on:
 *
 * - 24 `public` events on `active` records — visible to everyone;
 * - 2 `public` events on the account's own `restricted` record;
 * - 2 `public` events on someone else's `restricted` record;
 * - 6 `maintainer` events (fraud review and record administration);
 * - 2 `public` events on a `deleted` record.
 *
 * `act-0035` and `act-0036` share an instant on purpose: the id tiebreak is
 * the only thing that orders them, which is what keeps paging stable.
 */
export const ascendingEvents: RawActivityEvent[] = [
  // The deleted ticket's short life — public events, but the record is gone.
  event(35, "ticket.issued", "public", T5, 0, "Ticket tkt-0005 issued to this account."),
  event(36, "ticket.transferred", "public", T5, 0, "Ticket tkt-0005 transferred to a new holder."),

  // Everyday ticket and event activity on active records.
  event(1, "ticket.issued", "public", T, 1, "Ticket tkt-0001 issued to this account."),
  event(2, "event.created", "public", E1, 2, "Event evt-0001 created."),
  event(3, "ticket.transferred", "public", T, 3, "Ticket tkt-0001 transferred to a new holder."),
  event(4, "event.updated", "public", E1, 4, "Event evt-0001 updated: door time changed."),
  event(5, "ticket.issued", "public", T2, 5, "Ticket tkt-0002 issued to this account."),
  event(6, "ticket.redeemed", "public", T2, 6, "Ticket tkt-0002 redeemed at event evt-0001."),
  event(7, "event.created", "public", E2, 7, "Event evt-0002 created."),
  event(8, "event.cancelled", "public", E2, 8, "Event evt-0002 cancelled; tickets refunded."),
  event(9, "ticket.issued", "public", T3, 9, "Ticket tkt-0003 issued to this account."),
  event(10, "ticket.transferred", "public", T3, 10, "Ticket tkt-0003 transferred to a new holder."),
  event(11, "ticket.issued", "public", T4, 11, "Ticket tkt-0004 issued to this account."),
  event(12, "ticket.redeemed", "public", T4, 12, "Ticket tkt-0004 redeemed at event evt-0001."),
  event(13, "event.updated", "public", E1, 13, "Event evt-0001 updated: venue changed."),
  event(14, "ticket.issued", "public", subject("ticket", "tkt-0008"), 14, "Ticket tkt-0008 issued to this account."),
  event(15, "ticket.transferred", "public", subject("ticket", "tkt-0008"), 15, "Ticket tkt-0008 transferred to a new holder."),
  event(16, "ticket.issued", "public", subject("ticket", "tkt-0009"), 16, "Ticket tkt-0009 issued to this account."),
  event(17, "ticket.redeemed", "public", subject("ticket", "tkt-0009"), 17, "Ticket tkt-0009 redeemed at event evt-0001."),
  event(18, "event.created", "public", E3, 18, "Event evt-0003 created."),
  event(19, "event.updated", "public", E3, 19, "Event evt-0003 updated: capacity changed."),
  event(20, "event.cancelled", "public", E3, 20, "Event evt-0003 cancelled."),
  event(21, "ticket.issued", "public", subject("ticket", "tkt-0010"), 21, "Ticket tkt-0010 issued to this account."),
  event(22, "ticket.transferred", "public", subject("ticket", "tkt-0010"), 22, "Ticket tkt-0010 transferred to a new holder."),
  event(23, "ticket.issued", "public", subject("ticket", "tkt-0011"), 23, "Ticket tkt-0011 issued to this account."),
  event(24, "ticket.redeemed", "public", subject("ticket", "tkt-0011"), 24, "Ticket tkt-0011 redeemed at event evt-0001."),

  // The account's own restricted ticket: public events, restricted record.
  event(25, "ticket.issued", "public", T6, 25, "Ticket tkt-0006 issued to this account."),
  event(26, "ticket.transferred", "public", T6, 26, "Ticket tkt-0006 transferred to a new holder."),

  // Fraud review and record administration: maintainer-only context.
  event(27, "fraud.flag_raised", "maintainer", T3, 27, "Fraud flag raised on ticket tkt-0003 during transfer review."),
  event(28, "fraud.flag_cleared", "maintainer", T3, 28, "Fraud flag on ticket tkt-0003 cleared after review."),
  event(29, "fraud.hold_placed", "maintainer", T4, 29, "Hold placed on ticket tkt-0004."),
  event(30, "fraud.hold_released", "maintainer", T4, 30, "Hold on ticket tkt-0004 released."),
  event(33, "record.restricted", "maintainer", T6, 33, "Ticket tkt-0006 restricted pending review."),
  event(34, "record.deleted", "maintainer", T5, 34, "Ticket tkt-0005 deleted."),

  // Someone else's restricted ticket: public events the account cannot see.
  event(31, "ticket.issued", "public", T7, 31, "Ticket tkt-0007 issued to this account."),
  event(32, "ticket.transferred", "public", T7, 32, "Ticket tkt-0007 transferred to a new holder.")
];

/** The API's own ordering: newest first, id tiebreak included. */
export const descendingEvents: RawActivityEvent[] = [...ascendingEvents].reverse();

export function activityPage(records: RawActivityEvent[]) {
  return {
    _links: { self: { href: "" }, next: { href: "" }, prev: { href: "" } },
    _embedded: { records }
  };
}

export const accountResponse = activityPage(descendingEvents);
export const emptyResponse = activityPage([]);

/** A record missing a required field, so normalization cannot render it. */
export const malformedResponse = activityPage([
  {
    id: "act-9999",
    type: "ticket.issued",
    // No visibility: the record is not shaped like an activity event.
    actor: { kind: "system", id: "protocol" },
    subject: { kind: "ticket", id: "tkt-0001", ownerId: accountId, state: "active" },
    at: at(40),
    summary: "A record with no visibility class.",
    transactionHash: txHash(99)
  }
]);

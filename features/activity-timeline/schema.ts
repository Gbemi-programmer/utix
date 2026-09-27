import { StrKey } from "@stellar/stellar-sdk";
import { err, ok, type Result } from "@/core/result/result";
import type {
  ActivityTimelineErrorCode,
  ActivityTimelineField,
  ActivityTimelineInput,
  ActivityTypeFilter
} from "@/features/activity-timeline/types";

export const FIELD_OF_CODE: Record<ActivityTimelineErrorCode, ActivityTimelineField | null> = {
  empty_input: "accountId",
  invalid_address: "accountId",
  invalid_filter: null,
  record_not_found: null,
  rate_limited: null,
  request_failed: null
};

/** The type filters the form offers, in display order. */
export const TYPE_FILTERS: readonly ActivityTypeFilter[] = [
  "all",
  "ticket",
  "event",
  "fraud",
  "record"
];

function isTypeFilter(value: string): value is ActivityTypeFilter {
  return (TYPE_FILTERS as readonly string[]).includes(value);
}

/**
 * Parses raw form input into a validated request.
 *
 * Whitespace is stripped entirely rather than trimmed, because addresses are
 * usually pasted out of wrapped terminal output. A value starting with `S` is
 * rejected on the prefix alone, before any checksum work, so a secret seed is
 * never carried into a request, into state, or back onto the screen.
 */
export function parseActivityTimelineInput(
  raw: string,
  typeFilter: string = "all"
): Result<ActivityTimelineInput, ActivityTimelineErrorCode> {
  const accountId = raw.replace(/\s+/g, "");

  if (!accountId) return err("empty_input");
  if (accountId.startsWith("S")) return err("invalid_address");
  if (!StrKey.isValidEd25519PublicKey(accountId)) return err("invalid_address");
  if (!isTypeFilter(typeFilter)) return err("invalid_filter");

  return ok({ accountId, typeFilter });
}

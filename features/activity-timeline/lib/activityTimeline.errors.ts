import { classifyHorizonError } from "@/core/horizon/errors";
import type { ActivityTimelineErrorCode } from "@/features/activity-timeline/types";

/**
 * Maps transport failures onto this tool's own error codes.
 *
 * The activity API answers `/v1/accounts/{id}/activity` with a 404 when the
 * account has no history on the selected network, which is the single most
 * common mistake this tool sees, so it gets its own code rather than
 * `request_failed`.
 */
export function toActivityTimelineErrorCode(error: unknown): ActivityTimelineErrorCode {
  const { code } = classifyHorizonError(error);

  if (code === "not_found") return "record_not_found";
  if (code === "rate_limited") return "rate_limited";
  return "request_failed";
}

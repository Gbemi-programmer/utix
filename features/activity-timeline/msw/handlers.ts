import { delay, http, HttpResponse } from "msw";
import { ACTIVITY_TYPE_CATEGORIES } from "@/features/activity-timeline/lib/activityTimeline";
import {
  accountResponse,
  ascendingEvents,
  emptyResponse,
  malformedResponse,
  quietAccountId,
  unknownAccountId
} from "@/features/activity-timeline/fixtures/activityTimeline.fixture";

const ORIGIN = "https://api.utix.example";

/**
 * Serves the fixture history the way the activity API does: newest first,
 * optionally narrowed to one category by the `types` query parameter.
 *
 * The API stores every event — including maintainer-only ones. Keeping them
 * in the response is deliberate: the visibility rules in
 * `lib/activityTimeline.ts` are the boundary that keeps them out of a user's
 * timeline, and a mock that pre-filtered them would test the mock instead of
 * the rule.
 */
function activityHandlers() {
  return [
    http.get(`${ORIGIN}/v1/accounts/:accountId/activity`, ({ request, params }) => {
      const accountId = String(params.accountId ?? "");

      if (accountId === quietAccountId) return HttpResponse.json(emptyResponse);
      if (accountId === unknownAccountId) {
        return HttpResponse.json(
          {
            type: "https://stellar.org/horizon-errors/not_found",
            title: "Resource Missing",
            status: 404
          },
          { status: 404 }
        );
      }

      const types = new URL(request.url).searchParams.get("types");
      if (!types) return HttpResponse.json(accountResponse);

      const categories = types.split(",");
      const records = ascendingEvents.filter((record) =>
        categories.includes(ACTIVITY_TYPE_CATEGORIES[record.type])
      );
      return HttpResponse.json({
        _links: { self: { href: "" }, next: { href: "" }, prev: { href: "" } },
        _embedded: { records: [...records].reverse() }
      });
    })
  ];
}

export const handlers = activityHandlers();

const activityPath = `${ORIGIN}/v1/accounts/:accountId/activity`;

export const rateLimitedHandler = http.get(activityPath, () =>
  HttpResponse.json({ title: "Rate limit exceeded", status: 429 }, { status: 429 })
);

export const serverErrorHandler = http.get(activityPath, () =>
  HttpResponse.json({ title: "Internal Server Error", status: 500 }, { status: 500 })
);

export const transportFailureHandler = http.get(activityPath, () => HttpResponse.error());

export const malformedPageHandler = http.get(activityPath, () =>
  HttpResponse.json(malformedResponse)
);

export const slowActivityHandler = http.get(activityPath, async () => {
  await delay(50);
  return HttpResponse.json(accountResponse);
});

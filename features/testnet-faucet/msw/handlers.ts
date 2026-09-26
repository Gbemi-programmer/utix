import { delay, http, HttpResponse } from "msw";
import {
  PROBLEM_JSON,
  accountRacedBody,
  alreadyFundedBody,
  friendbotSuccess,
  fundedAccountId,
  invalidAddressBody,
  newAccountId,
  racedAccountId,
  rateLimitedAccountId,
  rejectedAddressAccountId,
  timedOutAccountId,
  upstreamErrorAccountId
} from "@/features/testnet-faucet/fixtures/testnetFaucet.fixture";

const FRIENDBOT = "https://friendbot.stellar.org";

/** One response per classified failure, keyed by the funded address. */
export const handlers = [
  http.get(FRIENDBOT, ({ request }) => {
    const addr = new URL(request.url).searchParams.get("addr");

    if (addr === newAccountId) return HttpResponse.json(friendbotSuccess);

    if (addr === fundedAccountId) {
      return new HttpResponse(alreadyFundedBody, { status: 400, headers: PROBLEM_JSON });
    }

    if (addr === racedAccountId) {
      return new HttpResponse(accountRacedBody, { status: 400, headers: PROBLEM_JSON });
    }

    if (addr === rejectedAddressAccountId) {
      return new HttpResponse(invalidAddressBody, { status: 400, headers: PROBLEM_JSON });
    }

    if (addr === rateLimitedAccountId) {
      return new HttpResponse("rate limited", { status: 429 });
    }

    if (addr === timedOutAccountId) {
      return new HttpResponse("gateway timeout", { status: 504 });
    }

    if (addr === upstreamErrorAccountId) {
      return new HttpResponse("upstream failure", { status: 502 });
    }

    return new HttpResponse("bad request", { status: 400 });
  })
];

export const unavailableHandler = http.get(
  FRIENDBOT,
  () => new HttpResponse("upstream failure", { status: 503 })
);

/** Success response whose body is not valid JSON. */
export const unparseableSuccessHandler = http.get(
  FRIENDBOT,
  () => new HttpResponse("<html>ok</html>", { status: 200 })
);

/** A 429 carrying `Retry-After` in delay-seconds form. */
export const retryAfterHandler = (seconds: number) =>
  http.get(
    FRIENDBOT,
    () =>
      new HttpResponse("rate limited", {
        status: 429,
        headers: { "retry-after": String(seconds) }
      })
  );

/** Friendbot never answers, so only the client timeout can end the request. */
export const hangingHandler = http.get(FRIENDBOT, async () => {
  await delay("infinite");
  return HttpResponse.json(friendbotSuccess);
});

import { http, HttpResponse, delay } from "msw";
import {
  emptyPathsResponse,
  mockStrictReceivePathsResponse,
  mockStrictSendPathsResponse,
  rateLimitedIssuer
} from "@/features/path-payment-finder/fixtures/pathPaymentFinder.fixture";

const TESTNET = "https://horizon-testnet.stellar.org";

export const handlers = [
  http.get(`${TESTNET}/paths/strict-send`, ({ request }) => {
    const url = new URL(request.url);
    const destAssets = url.searchParams.get("destination_assets") || "";

    if (destAssets.includes(rateLimitedIssuer)) {
      return HttpResponse.json(
        { title: "Rate Limit Exceeded", status: 429, detail: "Too Many Requests" },
        { status: 429 }
      );
    }

    if (url.searchParams.get("source_amount")?.startsWith("999")) {
      return HttpResponse.json(emptyPathsResponse);
    }

    return HttpResponse.json(mockStrictSendPathsResponse);
  }),

  http.get(`${TESTNET}/paths/strict-receive`, ({ request }) => {
    const url = new URL(request.url);
    const sourceAssets = url.searchParams.get("source_assets") || "";

    if (sourceAssets.includes(rateLimitedIssuer)) {
      return HttpResponse.json(
        { title: "Rate Limit Exceeded", status: 429, detail: "Too Many Requests" },
        { status: 429 }
      );
    }

    return HttpResponse.json(mockStrictReceivePathsResponse);
  })
];

export const pendingHandler = http.get(`${TESTNET}/paths/strict-send`, async () => {
  await delay("infinite");
  return HttpResponse.json(mockStrictSendPathsResponse);
});

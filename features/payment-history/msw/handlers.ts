import { http, HttpResponse, delay } from "msw";
import {
  emptyAccount,
  emptyPaymentsResponse,
  missingAccount,
  paymentsResponse,
  queriedAccount,
  rateLimitedAccount
} from "@/features/payment-history/fixtures/paymentHistory.fixture";

const TESTNET = "https://horizon-testnet.stellar.org";

export const handlers = [
  http.get(`${TESTNET}/accounts/${queriedAccount}/payments`, () => {
    return HttpResponse.json(paymentsResponse);
  }),

  http.get(`${TESTNET}/accounts/${emptyAccount}/payments`, () => {
    return HttpResponse.json(emptyPaymentsResponse);
  }),

  http.get(`${TESTNET}/accounts/${missingAccount}/payments`, () => {
    return HttpResponse.json(
      { title: "Resource Missing", status: 404, detail: "Account not found" },
      { status: 404 }
    );
  }),

  http.get(`${TESTNET}/accounts/${rateLimitedAccount}/payments`, () => {
    return HttpResponse.json(
      { title: "Rate Limit Exceeded", status: 429, detail: "Too Many Requests" },
      { status: 429 }
    );
  })
];

export const pendingHandler = http.get(`${TESTNET}/accounts/${queriedAccount}/payments`, async () => {
  await delay("infinite");
  return HttpResponse.json(paymentsResponse);
});

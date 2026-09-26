import { Keypair } from "@stellar/stellar-sdk";

const seed = (byte: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte));

export const newAccountId = seed(1).publicKey();
export const fundedAccountId = seed(2).publicKey();
export const rateLimitedAccountId = seed(3).publicKey();
export const secretSeed = seed(4).secret();
export const racedAccountId = seed(5).publicKey();
export const rejectedAddressAccountId = seed(6).publicKey();
export const timedOutAccountId = seed(7).publicKey();
export const upstreamErrorAccountId = seed(8).publicKey();

export const friendbotSuccess = {
  hash: "d".repeat(64),
  ledger: 1017700,
  successful: true
};

const problem = (detail: string, extras?: Record<string, string>) =>
  JSON.stringify({
    type: "https://stellar.org/friendbot-errors/bad_request",
    title: "Bad Request",
    status: 400,
    detail,
    ...(extras ? { extras } : {})
  });

/** Friendbot's real 400 body when the account already holds the starting balance. */
export const alreadyFundedBody = problem("account already funded to starting balance");

/** Friendbot's real 400 body when the account was created mid-request. */
export const accountRacedBody = problem("createAccountAlreadyExist (AAAAAAAAAAD////8AAAAAA==)");

/** Friendbot's real 400 body when it rejects the `addr` parameter. */
export const invalidAddressBody = problem("The request you sent was invalid in some way.", {
  invalid_field: "addr",
  reason: "invalid address: must be a valid G or C address"
});

export const PROBLEM_JSON = { "content-type": "application/problem+json; charset=utf-8" };

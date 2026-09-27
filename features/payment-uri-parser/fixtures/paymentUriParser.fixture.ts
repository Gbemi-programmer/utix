import { Keypair } from "@stellar/stellar-sdk";

const seed = (byte: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte));

export const testDestination = seed(20).publicKey();
export const testIssuer = seed(21).publicKey();
export const testSecret = seed(22).secret();

export const validPayUri = `web+stellar:pay?destination=${testDestination}&amount=100.5&asset_code=USDC&asset_issuer=${testIssuer}&memo=Invoice123&memo_type=MEMO_TEXT&msg=Thanks%20for%20lunch&origin_domain=example.com&signature=c2lnbmF0dXJl`;

export const validTxUri = `web+stellar:tx?xdr=AAAAAGX4%2B%2F8AAAAA&msg=Approve%20Trustline&origin_domain=stellar.org`;

export const invalidPayUri = `web+stellar:pay?destination=invalid-address&amount=-50&asset_code=USDC`;

export const unknownParamUri = `web+stellar:pay?destination=${testDestination}&amount=25&custom_tracking_id=xyz789`;

export const secretKeyUri = `web+stellar:pay?destination=${testDestination}&secret=${testSecret}`;

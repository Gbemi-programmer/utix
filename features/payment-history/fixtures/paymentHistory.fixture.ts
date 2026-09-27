import { Keypair } from "@stellar/stellar-sdk";

const seed = (byte: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte));

export const queriedAccount = seed(1).publicKey();
export const counterpartyAccount = seed(2).publicKey();
export const emptyAccount = seed(3).publicKey();
export const missingAccount = seed(4).publicKey();
export const rateLimitedAccount = seed(5).publicKey();

export const txHash1 = "1".repeat(64);
export const txHash2 = "2".repeat(64);
export const txHash3 = "3".repeat(64);
export const txHash4 = "4".repeat(64);

export const mockPaymentRecords = [
  {
    id: "op-101",
    paging_token: "101",
    type: "create_account",
    account: queriedAccount,
    funder: counterpartyAccount,
    starting_balance: "25.0000000",
    transaction_hash: txHash1,
    created_at: "2026-05-01T12:00:00Z"
  },
  {
    id: "op-102",
    paging_token: "102",
    type: "payment",
    from: queriedAccount,
    to: counterpartyAccount,
    asset_type: "native",
    amount: "100.5000000",
    transaction_hash: txHash2,
    created_at: "2026-05-02T14:30:00Z"
  },
  {
    id: "op-103",
    paging_token: "103",
    type: "path_payment_strict_send",
    from: counterpartyAccount,
    to: queriedAccount,
    asset_type: "credit_alphanum4",
    asset_code: "USDC",
    asset_issuer: counterpartyAccount,
    amount: "50.0000000",
    source_asset_type: "native",
    source_amount: "250.0000000",
    transaction_hash: txHash3,
    created_at: "2026-05-03T09:15:00Z"
  },
  {
    id: "op-104",
    paging_token: "104",
    type: "path_payment_strict_receive",
    from: queriedAccount,
    to: counterpartyAccount,
    asset_type: "native",
    amount: "75.0000000",
    source_asset_type: "credit_alphanum4",
    source_asset_code: "EURT",
    source_asset_issuer: counterpartyAccount,
    source_amount: "15.0000000",
    transaction_hash: txHash4,
    created_at: "2026-05-04T16:45:00Z"
  }
];

export const paymentsResponse = {
  _embedded: {
    records: mockPaymentRecords
  },
  _links: {
    self: { href: `https://horizon-testnet.stellar.org/accounts/${queriedAccount}/payments?order=desc&limit=20` },
    next: { href: `https://horizon-testnet.stellar.org/accounts/${queriedAccount}/payments?order=desc&limit=20&cursor=104` },
    prev: { href: `https://horizon-testnet.stellar.org/accounts/${queriedAccount}/payments?order=desc&limit=20&cursor=101` }
  }
};

export const emptyPaymentsResponse = {
  _embedded: {
    records: []
  },
  _links: {
    self: { href: `https://horizon-testnet.stellar.org/accounts/${emptyAccount}/payments?order=desc&limit=20` }
  }
};

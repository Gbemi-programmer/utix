import { Keypair } from "@stellar/stellar-sdk";

const seed = (byte: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte));

export const testIssuerA = seed(10).publicKey();
export const testIssuerB = seed(11).publicKey();
export const rateLimitedIssuer = seed(12).publicKey();

export const mockStrictSendPathsResponse = {
  _embedded: {
    records: [
      {
        source_asset_type: "native",
        source_amount: "100.0000000",
        destination_asset_type: "credit_alphanum4",
        destination_asset_code: "USDC",
        destination_asset_issuer: testIssuerA,
        destination_amount: "12.5000000",
        path: []
      },
      {
        source_asset_type: "native",
        source_amount: "100.0000000",
        destination_asset_type: "credit_alphanum4",
        destination_asset_code: "USDC",
        destination_asset_issuer: testIssuerA,
        destination_amount: "12.3000000",
        path: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "EURT",
            asset_issuer: testIssuerB
          }
        ]
      }
    ]
  }
};

export const mockStrictReceivePathsResponse = {
  _embedded: {
    records: [
      {
        source_asset_type: "credit_alphanum4",
        source_asset_code: "USDC",
        source_asset_issuer: testIssuerA,
        source_amount: "8.0000000",
        destination_asset_type: "native",
        destination_amount: "50.0000000",
        path: []
      }
    ]
  }
};

export const emptyPathsResponse = {
  _embedded: {
    records: []
  }
};

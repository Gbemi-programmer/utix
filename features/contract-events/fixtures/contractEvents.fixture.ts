import { Address, Keypair, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type { RpcEvent } from "@/features/contract-events/lib/contractEvents";

const seed = (byte: number) => Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte));
const contract = (byte: number) => StrKey.encodeContract(Buffer.alloc(32, byte));

export const contractId = contract(7);
/** A contract that emitted nothing in the range. */
export const quietContractId = contract(8);
/** A contract with more events than the page cap allows. */
export const busyContractId = contract(9);
/** The RPC rejects any request for this contract as out of its retention window. */
export const expiredContractId = contract(10);

export const fromAccount = seed(1).publicKey();
export const toAccount = seed(2).publicKey();
export const accountAddress = fromAccount;
/** Derived, never hand-typed; only ever used to prove it is rejected. */
export const secretKey = seed(3).secret();
export const contractHex = Buffer.alloc(32, 7).toString("hex");

export const latestLedger = 50_000;
export const transactionHash = "d".repeat(64);

const b64 = (val: xdr.ScVal) => val.toXDR("base64");

export const transferTopicsXdr = [
  b64(xdr.ScVal.scvSymbol("transfer")),
  b64(new Address(fromAccount).toScVal()),
  b64(new Address(toAccount).toScVal()),
  b64(xdr.ScVal.scvString("native"))
];
/** 1e20 does not fit in 64 bits, so it proves i128 is rendered without a float. */
export const transferAmount = "100000000000000000000";
export const transferValueXdr = b64(nativeToScVal(BigInt(transferAmount), { type: "i128" }));

export const mintValueXdr = b64(
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("amount"), val: xdr.ScVal.scvU32(5) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("memo"), val: xdr.ScVal.scvBytes(Buffer.from([0xde, 0xad])) })
  ])
);

export const transferEvent: RpcEvent = {
  type: "contract",
  ledger: 49_500,
  ledgerClosedAt: "2026-05-02T10:14:05Z",
  contractId,
  id: "0000212600430358528-0000000001",
  txHash: transactionHash,
  inSuccessfulContractCall: true,
  topic: transferTopicsXdr,
  value: transferValueXdr
};

export const failedMintEvent: RpcEvent = {
  type: "contract",
  ledger: 49_600,
  ledgerClosedAt: "2026-05-02T10:22:25Z",
  contractId,
  id: "0000212600859860992-0000000001",
  txHash: transactionHash,
  inSuccessfulContractCall: false,
  topic: [b64(xdr.ScVal.scvSymbol("mint"))],
  value: mintValueXdr
};

export const undecodableEvent: RpcEvent = {
  type: "diagnostic",
  ledger: 49_700,
  ledgerClosedAt: "2026-05-02T10:30:45Z",
  contractId,
  id: "0000212601289363456-0000000001",
  topic: ["not-xdr"],
  value: "AAAA"
};

export const events: RpcEvent[] = [transferEvent, failedMintEvent, undecodableEvent];

export function busyEvents(page: number, count: number): RpcEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    ...transferEvent,
    contractId: busyContractId,
    ledger: 49_000 + page,
    id: `busy-${page}-${index}`
  }));
}

export const outOfRangeMessage =
  "startLedger must be between the oldest ledger: 30000 and the latest ledger: 50000";

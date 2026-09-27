import { describe, expect, it } from "vitest";
import { Address, xdr } from "@stellar/stellar-sdk";
import {
  decodeScValXdr,
  eventName,
  formatLedgerRange,
  renderScVal
} from "@/features/contract-events/lib/format";
import {
  contractId,
  fromAccount,
  mintValueXdr,
  transferAmount,
  transferTopicsXdr,
  transferValueXdr
} from "@/features/contract-events/fixtures/contractEvents.fixture";

describe("renderScVal", () => {
  it("renders scalars", () => {
    expect(renderScVal(xdr.ScVal.scvBool(true))).toBe("true");
    expect(renderScVal(xdr.ScVal.scvVoid())).toBe("void");
    expect(renderScVal(xdr.ScVal.scvU32(42))).toBe("42");
    expect(renderScVal(xdr.ScVal.scvI32(-7))).toBe("-7");
  });

  it("keeps 128-bit integers exact", () => {
    expect(decodeScValXdr(transferValueXdr)).toMatchObject({
      type: "I128",
      display: transferAmount,
      decoded: true
    });
  });

  it("renders symbols bare, strings quoted and bytes as hex", () => {
    expect(renderScVal(xdr.ScVal.scvSymbol("transfer"))).toBe("transfer");
    expect(renderScVal(xdr.ScVal.scvString('say "hi"'))).toBe('"say \\"hi\\""');
    expect(renderScVal(xdr.ScVal.scvBytes(Buffer.from([0, 255])))).toBe("0x00ff");
  });

  it("renders account and contract addresses as StrKeys", () => {
    expect(renderScVal(new Address(fromAccount).toScVal())).toBe(fromAccount);
    expect(renderScVal(new Address(contractId).toScVal())).toBe(contractId);
  });

  it("renders vectors and maps recursively", () => {
    expect(renderScVal(xdr.ScVal.scvVec([xdr.ScVal.scvU32(1), xdr.ScVal.scvSymbol("a")]))).toBe("[1, a]");
    expect(decodeScValXdr(mintValueXdr).display).toBe("{amount: 5, memo: 0xdead}");
  });

  it("renders contract errors with their code", () => {
    expect(renderScVal(xdr.ScVal.scvError(xdr.ScError.sceContract(3)))).toBe("Error(Contract, 3)");
  });

  it("cuts off pathologically deep nesting", () => {
    let val = xdr.ScVal.scvU32(1);
    for (let i = 0; i < 20; i += 1) val = xdr.ScVal.scvVec([val]);
    expect(renderScVal(val)).toContain("…");
  });
});

describe("decodeScValXdr", () => {
  it("falls back to the raw XDR instead of throwing", () => {
    expect(decodeScValXdr("not-xdr")).toEqual({
      type: "Unknown",
      display: "not-xdr",
      raw: "not-xdr",
      decoded: false
    });
  });
});

describe("eventName", () => {
  it("reads a symbol first topic as the event name", () => {
    expect(eventName(transferTopicsXdr.map(decodeScValXdr))).toBe("transfer");
  });

  it("unquotes a string first topic", () => {
    expect(eventName([decodeScValXdr(xdr.ScVal.scvString("paid").toXDR("base64"))])).toBe("paid");
  });

  it("returns undefined for other or missing first topics", () => {
    expect(eventName([])).toBeUndefined();
    expect(eventName([decodeScValXdr(transferValueXdr)])).toBeUndefined();
    expect(eventName([decodeScValXdr("not-xdr")])).toBeUndefined();
  });
});

describe("formatLedgerRange", () => {
  it("shows the inclusive range searched", () => {
    expect(formatLedgerRange(100, 201, "latest")).toBe("100 → 200");
  });

  it("marks an open-ended range", () => {
    expect(formatLedgerRange(1000, undefined, "latest")).toBe("1,000 → latest");
  });
});

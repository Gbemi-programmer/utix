import { describe, expect, it } from "vitest";
import { parseContractEventsInput } from "@/features/contract-events/schema";
import {
  accountAddress,
  contractHex,
  contractId,
  secretKey
} from "@/features/contract-events/fixtures/contractEvents.fixture";

const input = (contract: string, startLedger = "", endLedger = "") =>
  parseContractEventsInput({ contractId: contract, startLedger, endLedger });

describe("parseContractEventsInput", () => {
  it("accepts a contract ID with no ledger range", () => {
    expect(input(contractId)).toEqual({
      ok: true,
      value: { contractId, startLedger: undefined, endLedger: undefined }
    });
  });

  it("parses both ledger bounds", () => {
    const result = input(contractId, " 100 ", "200");
    expect(result.ok && result.value).toMatchObject({ startLedger: 100, endLedger: 200 });
  });

  it("normalises case and strips whitespace from a wrapped paste", () => {
    const result = input(`${contractId.slice(0, 20).toLowerCase()}\n ${contractId.slice(20)}`);
    expect(result.ok && result.value.contractId).toBe(contractId);
  });

  it("rejects empty input", () => {
    expect(input("   ")).toEqual({ ok: false, code: "empty_contract_id" });
  });

  it("rejects a secret key on its prefix without echoing it", () => {
    const result = input(secretKey);
    expect(result).toEqual({ ok: false, code: "secret_key" });
    expect(JSON.stringify(result)).not.toContain(secretKey);
  });

  it("gives an account address its own code", () => {
    expect(input(accountAddress)).toEqual({ ok: false, code: "account_address" });
  });

  it("rejects a hex contract ID and a bad checksum", () => {
    expect(input(contractHex)).toEqual({ ok: false, code: "invalid_contract_id" });
    const corrupted = `${contractId.slice(0, -1)}${contractId.endsWith("A") ? "B" : "A"}`;
    expect(input(corrupted)).toEqual({ ok: false, code: "invalid_contract_id" });
  });

  it("rejects non-numeric, zero and out-of-uint32 ledgers", () => {
    expect(input(contractId, "abc")).toEqual({ ok: false, code: "invalid_start_ledger" });
    expect(input(contractId, "0")).toEqual({ ok: false, code: "invalid_start_ledger" });
    expect(input(contractId, "1.5")).toEqual({ ok: false, code: "invalid_start_ledger" });
    expect(input(contractId, "", "4294967296")).toEqual({ ok: false, code: "invalid_end_ledger" });
  });

  it("rejects an end ledger that is not after the start, since the end is exclusive", () => {
    expect(input(contractId, "200", "200")).toEqual({ ok: false, code: "invalid_range" });
    expect(input(contractId, "200", "100")).toEqual({ ok: false, code: "invalid_range" });
  });
});

import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { DecodedScVal } from "@/features/contract-events/types";

import { formatInteger } from "@/core/format/amount";

export { formatDateTime as formatTimestamp } from "@/core/format/date";
export { formatInteger };

/** Deeply nested values are cut off rather than rendered into an unreadable wall. */
const MAX_DEPTH = 8;

function typeName(val: xdr.ScVal): string {
  return val.switch().name.replace(/^scv/, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function text(value: string | Uint8Array): string {
  return typeof value === "string" ? value : new TextDecoder().decode(value);
}

/**
 * Renders an ScVal as compact, JSON-like text.
 *
 * Integers above 64 bits come back from the SDK as `bigint`, so they are
 * printed from that directly; nothing passes through a float. Symbols are bare
 * (they are identifiers such as `transfer`), strings are quoted, bytes are hex,
 * and addresses are StrKeys so they can be pasted into other tools.
 */
export function renderScVal(val: xdr.ScVal, depth = 0): string {
  if (depth > MAX_DEPTH) return "…";

  switch (val.switch().name) {
    case "scvBool":
      return String(val.b());
    case "scvVoid":
      return "void";
    case "scvU32":
      return String(val.u32());
    case "scvI32":
      return String(val.i32());
    case "scvU64":
    case "scvI64":
    case "scvTimepoint":
    case "scvDuration":
    case "scvU128":
    case "scvI128":
    case "scvU256":
    case "scvI256":
      return String(scValToNative(val));
    case "scvBytes":
      return `0x${bytesToHex(val.bytes())}`;
    case "scvString":
      return JSON.stringify(text(val.str()));
    case "scvSymbol":
      return text(val.sym());
    case "scvAddress":
      return Address.fromScAddress(val.address()).toString();
    case "scvVec":
      return `[${(val.vec() ?? []).map((item) => renderScVal(item, depth + 1)).join(", ")}]`;
    case "scvMap":
      return `{${(val.map() ?? [])
        .map((entry) => `${renderScVal(entry.key(), depth + 1)}: ${renderScVal(entry.val(), depth + 1)}`)
        .join(", ")}}`;
    case "scvError": {
      const error = val.error();
      const kind = error.switch().name.replace(/^sce/, "");
      const code = kind === "Contract" ? error.contractCode() : error.code().name.replace(/^scec/, "");
      return `Error(${kind}, ${code})`;
    }
    case "scvLedgerKeyContractInstance":
      return "ContractInstance";
    case "scvLedgerKeyNonce":
      return `Nonce(${val.nonceKey().nonce().toString()})`;
    default:
      return typeName(val);
  }
}

/**
 * Decodes one base64 ScVal from the RPC. Never throws: an undecodable value is
 * still shown, as its raw XDR, so one odd topic does not hide the whole event.
 */
export function decodeScValXdr(raw: string): DecodedScVal {
  try {
    const val = xdr.ScVal.fromXDR(raw, "base64");
    return { type: typeName(val), display: renderScVal(val), raw, decoded: true };
  } catch {
    return { type: "Unknown", display: raw, raw, decoded: false };
  }
}

/**
 * The first topic of a contract event is conventionally its name (`transfer`,
 * `mint`, …). Returns it when it is a symbol or string, so the list can be
 * scanned by event name.
 */
export function eventName(topics: DecodedScVal[]): string | undefined {
  const [first] = topics;
  if (!first?.decoded) return undefined;
  if (first.type === "Symbol") return first.display;
  if (first.type === "String") return JSON.parse(first.display) as string;
  return undefined;
}

/** Renders the inclusive range actually searched; `end` is exclusive on the wire. */
export function formatLedgerRange(start: number, end: number | undefined, openEnded: string): string {
  return `${formatInteger(start)} → ${end === undefined ? openEnded : formatInteger(end - 1)}`;
}

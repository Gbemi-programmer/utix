import type { ParamStatus } from "@/features/payment-uri-parser/types";

export function getParamStatusBadgeClass(status: ParamStatus): string {
  switch (status) {
    case "valid":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "warning":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "error":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "info":
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export function formatParamLabel(key: string): string {
  const map: Record<string, string> = {
    destination: "Destination Account",
    amount: "Payment Amount",
    asset_code: "Asset Code",
    asset_issuer: "Asset Issuer",
    memo: "Memo Content",
    memo_type: "Memo Type",
    msg: "Message to User",
    network_passphrase: "Network Passphrase",
    origin_domain: "Origin Domain",
    signature: "SEP-0007 Signature",
    callback: "Callback URL",
    xdr: "Transaction Envelope XDR"
  };
  return map[key] || key;
}

export function truncateDisplayValue(val: string, maxLen = 48): string {
  if (!val) return "—";
  if (val.length <= maxLen) return val;
  return `${val.slice(0, Math.floor(maxLen / 2))}…${val.slice(-Math.floor(maxLen / 2))}`;
}

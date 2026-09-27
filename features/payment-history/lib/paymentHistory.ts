import { err, ok, type Result } from "@/core/result/result";
import { horizonServer } from "@/core/horizon/client";
import type { StellarNetwork } from "@/core/network/types";
import { toPaymentHistoryErrorCode } from "@/features/payment-history/lib/paymentHistory.errors";
import type {
  NormalizedPayment,
  PaymentDirection,
  PaymentHistoryErrorCode,
  PaymentHistoryInput,
  PaymentHistoryPage,
  PaymentType
} from "@/features/payment-history/types";

interface HorizonRawPaymentRecord {
  id?: string;
  type?: string;
  type_i?: number;
  paging_token?: string;
  transaction_hash?: string;
  created_at?: string;
  account?: string;
  funder?: string;
  starting_balance?: string;
  from?: string;
  to?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
  source_asset_type?: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  source_amount?: string;
  [key: string]: unknown;
}

interface HorizonPaymentsResponse {
  records: HorizonRawPaymentRecord[];
  _links?: {
    next?: { href?: string };
    prev?: { href?: string };
  };
}

export function normalizePaymentRecord(
  raw: HorizonRawPaymentRecord,
  queriedAccountId: string
): NormalizedPayment {
  const type = (raw.type as PaymentType) || "payment";
  let direction: PaymentDirection = "incoming";
  let counterparty = "—";
  let asset = "XLM";
  let amount = "0";

  const typeLabels: Record<PaymentType, string> = {
    create_account: "Create Account",
    payment: "Payment",
    path_payment_strict_send: "Path Payment (Strict Send)",
    path_payment_strict_receive: "Path Payment (Strict Receive)"
  };

  if (type === "create_account") {
    if (raw.funder === queriedAccountId) {
      direction = "outgoing";
      counterparty = raw.account || "—";
    } else {
      direction = "incoming";
      counterparty = raw.funder || "—";
    }
    asset = "XLM";
    amount = raw.starting_balance ?? "0";
  } else if (type === "payment") {
    if (raw.from === queriedAccountId) {
      direction = "outgoing";
      counterparty = raw.to || "—";
    } else {
      direction = "incoming";
      counterparty = raw.from || "—";
    }
    asset = raw.asset_type === "native" ? "XLM" : (raw.asset_code || "UNKNOWN");
    amount = raw.amount ?? "0";
  } else if (type === "path_payment_strict_send" || type === "path_payment_strict_receive") {
    if (raw.from === queriedAccountId) {
      direction = "outgoing";
      counterparty = raw.to || "—";
      asset = raw.source_asset_type === "native" ? "XLM" : (raw.source_asset_code || "UNKNOWN");
      amount = raw.source_amount ?? "0";
    } else {
      direction = "incoming";
      counterparty = raw.from || "—";
      asset = raw.asset_type === "native" ? "XLM" : (raw.asset_code || "UNKNOWN");
      amount = raw.amount ?? "0";
    }
  }

  return {
    id: String(raw.id ?? raw.paging_token ?? ""),
    type,
    typeLabel: typeLabels[type] || String(type),
    direction,
    counterparty,
    asset,
    amount,
    transactionHash: String(raw.transaction_hash ?? ""),
    createdAt: String(raw.created_at ?? "")
  };
}

function extractCursor(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, "https://horizon.stellar.org");
    return url.searchParams.get("cursor");
  } catch {
    return null;
  }
}

export async function fetchPaymentHistory(
  { accountId, cursor }: PaymentHistoryInput,
  network: StellarNetwork
): Promise<Result<PaymentHistoryPage, PaymentHistoryErrorCode>> {
  try {
    const server = horizonServer(network);

    let builder = server.payments().forAccount(accountId).order("desc").limit(20);
    if (cursor) {
      builder = builder.cursor(cursor);
    }

    const res = (await builder.call()) as unknown as HorizonPaymentsResponse;
    const records = Array.isArray(res.records) ? res.records : [];

    const payments = records.map((record) => normalizePaymentRecord(record, accountId));
    const nextCursor =
      extractCursor(res._links?.next?.href) ??
      (records.length > 0 ? (records[records.length - 1].paging_token ?? null) : null);
    const prevCursor =
      extractCursor(res._links?.prev?.href) ??
      (records.length > 0 ? (records[0].paging_token ?? null) : null);

    return ok({
      payments,
      prevCursor,
      nextCursor,
      accountId
    });
  } catch (error) {
    return err(toPaymentHistoryErrorCode(error));
  }
}

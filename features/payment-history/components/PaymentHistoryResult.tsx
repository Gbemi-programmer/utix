import { Card, CardHeader, CardTitle } from "@/core/ui/Card";
import { Button } from "@/core/ui/Button";
import { CopyableValue } from "@/core/ui/CopyableValue";
import { StatusMessage } from "@/core/ui/StatusMessage";
import { copy } from "@/features/payment-history/copy";
import {
  formatShortAddress,
  formatTimestamp,
  getDirectionBadgeClass
} from "@/features/payment-history/lib/format";
import type { PaymentHistoryPage } from "@/features/payment-history/types";

interface Props {
  page: PaymentHistoryPage;
  onPaginate?: (cursor: string) => void;
  pending?: boolean;
}

export function PaymentHistoryResult({ page, onPaginate, pending }: Props) {
  if (page.payments.length === 0) {
    return (
      <StatusMessage
        type="info"
        title={copy.noPaymentsTitle}
        description={copy.noPaymentsDescription}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{copy.resultTitle}</CardTitle>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" role="table" aria-label={copy.resultTitle}>
            <thead className="border-b border-[#e3ebf5] bg-[#f8fafc] text-xs font-semibold text-[#68758a]">
              <tr>
                <th scope="col" className="px-4 py-3">Direction</th>
                <th scope="col" className="px-4 py-3">Type</th>
                <th scope="col" className="px-4 py-3">{copy.counterpartyLabel}</th>
                <th scope="col" className="px-4 py-3">{copy.amountLabel}</th>
                <th scope="col" className="px-4 py-3">{copy.txLabel}</th>
                <th scope="col" className="px-4 py-3">{copy.dateLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3ebf5]">
              {page.payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-white/80">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${getDirectionBadgeClass(payment.direction)}`}
                    >
                      {payment.direction === "incoming" ? copy.directionIncoming : copy.directionOutgoing}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-[#172033]">
                    {payment.typeLabel}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {payment.counterparty !== "—" ? (
                      <CopyableValue
                        label="counterparty"
                        value={payment.counterparty}
                        visible={6}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <span className="font-semibold text-[#172033]">{payment.amount}</span>{" "}
                    <span className="text-xs text-[#8a98aa]">{payment.asset}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {payment.transactionHash ? (
                      <CopyableValue
                        label="transaction hash"
                        value={payment.transactionHash}
                        visible={6}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-[#68758a]">
                    {formatTimestamp(payment.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-[#e3ebf5] p-4">
          <Button
            type="button"
            variant="ghost"
            disabled={!page.prevCursor || pending}
            onClick={() => page.prevCursor && onPaginate?.(page.prevCursor)}
          >
            {copy.prevPage}
          </Button>

          <Button
            type="button"
            variant="ghost"
            disabled={!page.nextCursor || pending}
            onClick={() => page.nextCursor && onPaginate?.(page.nextCursor)}
          >
            {copy.nextPage}
          </Button>
        </div>
      </Card>
    </div>
  );
}

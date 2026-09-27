"use client";

import { Card } from "@/core/ui/Card";
import { SkeletonRows } from "@/core/ui/Skeleton";
import { StatusMessage } from "@/core/ui/StatusMessage";
import { usePaymentHistory } from "@/features/payment-history/hooks/usePaymentHistory";
import { copy, errorCopy } from "@/features/payment-history/copy";
import { PaymentHistoryForm } from "@/features/payment-history/components/PaymentHistoryForm";
import { PaymentHistoryResult } from "@/features/payment-history/components/PaymentHistoryResult";
import { PaymentHistoryEmptyState } from "@/features/payment-history/components/PaymentHistoryEmptyState";

export function PaymentHistoryPanel() {
  const { state, submit, paginate } = usePaymentHistory();

  return (
    <div className="space-y-5">
      <Card>
        <PaymentHistoryForm
          onSubmit={submit}
          pending={state.status === "loading"}
        />
      </Card>

      {state.status === "loading" ? (
        <Card>
          <p className="sr-only" role="status">
            {copy.loading}
          </p>
          <SkeletonRows rows={5} />
        </Card>
      ) : null}

      {state.status === "error" ? (
        <StatusMessage
          type="error"
          title={errorCopy[state.code].title}
          description={errorCopy[state.code].description}
        />
      ) : null}

      {state.status === "success" ? (
        <PaymentHistoryResult
          page={state.page}
          onPaginate={paginate}
          pending={state.status === "loading"}
        />
      ) : null}

      {state.status === "idle" ? <PaymentHistoryEmptyState /> : null}
    </div>
  );
}

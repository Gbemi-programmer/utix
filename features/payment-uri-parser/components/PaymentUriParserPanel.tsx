"use client";

import { Card } from "@/core/ui/Card";
import { SkeletonRows } from "@/core/ui/Skeleton";
import { StatusMessage } from "@/core/ui/StatusMessage";
import { copy } from "@/features/payment-uri-parser/copy";
import { usePaymentUriParser } from "@/features/payment-uri-parser/hooks/usePaymentUriParser";
import { PaymentUriParserEmptyState } from "@/features/payment-uri-parser/components/PaymentUriParserEmptyState";
import { PaymentUriParserForm } from "@/features/payment-uri-parser/components/PaymentUriParserForm";
import { PaymentUriParserResult } from "@/features/payment-uri-parser/components/PaymentUriParserResult";

export function PaymentUriParserPanel() {
  const { status, result, error, parse, pending } = usePaymentUriParser();

  return (
    <div className="space-y-5">
      <Card>
        <PaymentUriParserForm onSubmit={parse} pending={pending} />
      </Card>

      {status === "loading" ? (
        <Card>
          <p className="sr-only" role="status">
            {copy.loading}
          </p>
          <SkeletonRows rows={4} />
        </Card>
      ) : null}

      {status === "error" && error ? (
        <StatusMessage
          type="error"
          title="Parsing Failed"
          description={copy.errors[error] || copy.errors.invalid_uri}
        />
      ) : null}

      {status === "success" && result ? (
        <PaymentUriParserResult result={result} />
      ) : null}

      {status === "idle" ? <PaymentUriParserEmptyState /> : null}
    </div>
  );
}

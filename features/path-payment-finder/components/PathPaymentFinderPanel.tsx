"use client";

import { Card } from "@/core/ui/Card";
import { SkeletonRows } from "@/core/ui/Skeleton";
import { StatusMessage } from "@/core/ui/StatusMessage";
import { copy } from "@/features/path-payment-finder/copy";
import { usePathPaymentFinder } from "@/features/path-payment-finder/hooks/usePathPaymentFinder";
import { PathPaymentFinderEmptyState } from "@/features/path-payment-finder/components/PathPaymentFinderEmptyState";
import { PathPaymentFinderForm } from "@/features/path-payment-finder/components/PathPaymentFinderForm";
import { PathPaymentFinderResult } from "@/features/path-payment-finder/components/PathPaymentFinderResult";

export function PathPaymentFinderPanel() {
  const { status, result, error, run, pending } = usePathPaymentFinder();

  return (
    <div className="space-y-5">
      <Card>
        <PathPaymentFinderForm onSubmit={run} pending={pending} />
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
          title="Search Failed"
          description={copy.errors[error] || copy.errors.request_failed}
        />
      ) : null}

      {status === "success" && result ? (
        <PathPaymentFinderResult result={result} />
      ) : null}

      {status === "idle" ? <PathPaymentFinderEmptyState /> : null}
    </div>
  );
}

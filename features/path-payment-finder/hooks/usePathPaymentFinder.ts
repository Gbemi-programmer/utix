import { useState, useCallback } from "react";
import { useNetwork } from "@/core/network/NetworkProvider";
import { findPaymentPaths } from "@/features/path-payment-finder/lib/pathPaymentFinder";
import type {
  PathPaymentFinderErrorCode,
  PathPaymentFinderInput,
  PathPaymentFinderResult
} from "@/features/path-payment-finder/types";

export type PathPaymentFinderStatus = "idle" | "loading" | "success" | "error";

export function usePathPaymentFinder() {
  const { network } = useNetwork();
  const [status, setStatus] = useState<PathPaymentFinderStatus>("idle");
  const [result, setResult] = useState<PathPaymentFinderResult | null>(null);
  const [error, setError] = useState<PathPaymentFinderErrorCode | null>(null);

  const run = useCallback(
    async (input: PathPaymentFinderInput) => {
      setStatus("loading");
      setError(null);

      const res = await findPaymentPaths(input, network);

      if (res.ok) {
        setResult(res.value);
        setStatus("success");
      } else {
        setResult(null);
        setError(res.code);
        setStatus("error");
      }
    },
    [network]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    result,
    error,
    run,
    reset,
    pending: status === "loading"
  };
}

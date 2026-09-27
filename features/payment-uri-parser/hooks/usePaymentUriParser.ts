import { useState, useCallback } from "react";
import { parseSep7Uri } from "@/features/payment-uri-parser/lib/paymentUriParser";
import type {
  ParsedPaymentUri,
  PaymentUriParserErrorCode,
  PaymentUriParserInput
} from "@/features/payment-uri-parser/types";

export type PaymentUriParserStatus = "idle" | "loading" | "success" | "error";

export function usePaymentUriParser() {
  const [status, setStatus] = useState<PaymentUriParserStatus>("idle");
  const [result, setResult] = useState<ParsedPaymentUri | null>(null);
  const [error, setError] = useState<PaymentUriParserErrorCode | null>(null);

  const parse = useCallback(async (input: PaymentUriParserInput) => {
    setStatus("loading");
    setError(null);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const res = parseSep7Uri(input);

    if (res.ok) {
      setResult(res.value);
      setStatus("success");
    } else {
      setResult(null);
      setError(res.code);
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    result,
    error,
    parse,
    reset,
    pending: status === "loading"
  };
}

"use client";

import { useCallback, useRef, useState } from "react";
import { isErr } from "@/core/result/result";
import { parseFaucetInput } from "@/features/testnet-faucet/schema";
import { abortableSleep, fundWithBackoff } from "@/features/testnet-faucet/lib/backoff";
import type {
  FaucetErrorCode,
  FaucetRetry,
  FaucetSuccess
} from "@/features/testnet-faucet/types";

export type TestnetFaucetState =
  | { status: "idle" }
  | { status: "funding" }
  | { status: "waiting"; retry: FaucetRetry }
  | { status: "success"; result: FaucetSuccess }
  | { status: "error"; code: FaucetErrorCode; retryAfterMs?: number };

export function useTestnetFaucet() {
  const [state, setState] = useState<TestnetFaucetState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  const submit = useCallback(async (raw: string) => {
    const parsed = parseFaucetInput(raw);

    if (isErr(parsed)) {
      setState({ status: "error", code: parsed.code });
      return;
    }

    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setState({ status: "funding" });

    const result = await fundWithBackoff(parsed.value, {
      signal: next.signal,
      onRetry: (retry) => {
        if (!next.signal.aborted) setState({ status: "waiting", retry });
      },
      // The retry request is in flight again once the wait ends.
      sleep: async (ms, signal) => {
        await abortableSleep(ms, signal);
        if (!signal?.aborted) setState({ status: "funding" });
      }
    });
    if (next.signal.aborted) return;

    setState(
      result.ok
        ? { status: "success", result: result.value }
        : { status: "error", code: result.code, retryAfterMs: result.detail?.retryAfterMs }
    );
  }, []);

  const reset = useCallback(() => {
    controller.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, submit, reset };
}

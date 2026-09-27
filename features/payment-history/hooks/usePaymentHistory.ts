"use client";

import { useCallback, useRef, useState } from "react";
import { useNetwork } from "@/core/network/NetworkProvider";
import { isErr } from "@/core/result/result";
import type { StellarNetwork } from "@/core/network/types";
import { parsePaymentHistoryInput } from "@/features/payment-history/schema";
import { fetchPaymentHistory } from "@/features/payment-history/lib/paymentHistory";
import type {
  PaymentHistoryErrorCode,
  PaymentHistoryPage
} from "@/features/payment-history/types";

export type PaymentHistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; page: PaymentHistoryPage }
  | { status: "error"; code: PaymentHistoryErrorCode };

const IDLE: PaymentHistoryState = { status: "idle" };

interface Held {
  state: PaymentHistoryState;
  network: StellarNetwork;
}

export function usePaymentHistory() {
  const { network } = useNetwork();
  const [held, setHeld] = useState<Held>({ state: IDLE, network });
  const currentAccount = useRef<string>("");
  const requestId = useRef(0);

  const state = held.network === network ? held.state : IDLE;

  const submit = useCallback(
    async (raw: string) => {
      const parsed = parsePaymentHistoryInput(raw);
      if (isErr(parsed)) {
        setHeld({ state: { status: "error", code: parsed.code }, network });
        return;
      }

      currentAccount.current = parsed.value.accountId;
      requestId.current += 1;
      const id = requestId.current;
      setHeld({ state: { status: "loading" }, network });

      const result = await fetchPaymentHistory(
        { accountId: parsed.value.accountId },
        network
      );

      if (id !== requestId.current) return;

      setHeld({
        state: result.ok
          ? { status: "success", page: result.value }
          : { status: "error", code: result.code },
        network
      });
    },
    [network]
  );

  const paginate = useCallback(
    async (cursor: string) => {
      if (!currentAccount.current) return;
      requestId.current += 1;
      const id = requestId.current;
      setHeld({ state: { status: "loading" }, network });

      const result = await fetchPaymentHistory(
        { accountId: currentAccount.current, cursor },
        network
      );

      if (id !== requestId.current) return;

      setHeld({
        state: result.ok
          ? { status: "success", page: result.value }
          : { status: "error", code: result.code },
        network
      });
    },
    [network]
  );

  const reset = useCallback(() => {
    currentAccount.current = "";
    requestId.current += 1;
    setHeld({ state: IDLE, network });
  }, [network]);

  return { state, submit, paginate, reset };
}

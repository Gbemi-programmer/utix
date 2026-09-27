"use client";

import { useCallback, useRef, useState } from "react";
import { useNetwork } from "@/core/network/NetworkProvider";
import { isErr } from "@/core/result/result";
import type { StellarNetwork } from "@/core/network/types";
import {
  parseContractEventsInput,
  type RawContractEventsInput
} from "@/features/contract-events/schema";
import { fetchContractEvents } from "@/features/contract-events/lib/contractEvents";
import type {
  ContractEventsErrorCode,
  ContractEventsResult
} from "@/features/contract-events/types";

export type ContractEventsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ContractEventsResult }
  | { status: "error"; code: ContractEventsErrorCode };

const IDLE: ContractEventsState = { status: "idle" };

interface Held {
  state: ContractEventsState;
  network: StellarNetwork;
}

export function useContractEvents() {
  const { network } = useNetwork();
  const [held, setHeld] = useState<Held>({ state: IDLE, network });
  const requestId = useRef(0);

  // Contracts and ledger numbers are network-specific, so a result fetched on
  // another network is derived away rather than left on screen.
  const state = held.network === network ? held.state : IDLE;

  const submit = useCallback(
    async (raw: RawContractEventsInput) => {
      const parsed = parseContractEventsInput(raw);

      if (isErr(parsed)) {
        requestId.current += 1;
        setHeld({ state: { status: "error", code: parsed.code }, network });
        return;
      }

      requestId.current += 1;
      const id = requestId.current;
      setHeld({ state: { status: "loading" }, network });

      const result = await fetchContractEvents(parsed.value, network);
      if (id !== requestId.current) return;

      setHeld({
        state: result.ok
          ? { status: "success", result: result.value }
          : { status: "error", code: result.code },
        network
      });
    },
    [network]
  );

  const reset = useCallback(() => {
    requestId.current += 1;
    setHeld({ state: IDLE, network });
  }, [network]);

  return { state, submit, reset };
}

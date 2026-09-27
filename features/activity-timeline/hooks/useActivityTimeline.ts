"use client";

import { useCallback, useRef, useState } from "react";
import { useNetwork } from "@/core/network/NetworkProvider";
import { isErr } from "@/core/result/result";
import type { StellarNetwork } from "@/core/network/types";
import { parseActivityTimelineInput } from "@/features/activity-timeline/schema";
import {
  loadActivityPage,
  viewerActor
} from "@/features/activity-timeline/lib/activityTimeline";
import type {
  ActivityTimelineErrorCode,
  ActivityTimelinePage,
  ActivityTimelineRequest,
  ActivityTypeFilter
} from "@/features/activity-timeline/types";

export type ActivityTimelineState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; page: ActivityTimelinePage; pageIndex: number }
  | { status: "error"; code: ActivityTimelineErrorCode };

const IDLE: ActivityTimelineState = { status: "idle" };

export interface ActivityTimelineOptions {
  /**
   * The actor whose timeline is being read. Defaults to an anonymous viewer,
   * who sees public events on active records and nothing else. A maintainer
   * actor sees everything; the visibility rules in `lib/activityTimeline.ts`
   * decide what that includes.
   */
  actor?: { readonly kind: "user" | "maintainer" | "system"; readonly id: string };
}

interface Held {
  state: ActivityTimelineState;
  network: StellarNetwork;
}

/** What it takes to re-request a page, so going back is a replay, not a guess. */
interface PageRequest {
  cursor?: string;
}

export function useActivityTimeline({ actor = viewerActor() }: ActivityTimelineOptions = {}) {
  const { network } = useNetwork();
  const [held, setHeld] = useState<Held>({ state: IDLE, network });
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  /** `trail.current[i]` is the request that produced page `i`. */
  const trail = useRef<PageRequest[]>([]);

  // An account's history belongs to the network it was read from, so a result
  // from the other network is derived away instead of reset in an effect.
  const state = held.network === network ? held.state : IDLE;

  const load = useCallback(
    async (accountId: string, typeFilter: ActivityTypeFilter, pageIndex: number) => {
      controller.current?.abort();
      requestId.current += 1;
      const id = requestId.current;
      const next = new AbortController();
      controller.current = next;

      setHeld({ state: { status: "loading" }, network });

      const request = trail.current[pageIndex] ?? {};
      const result = await loadActivityPage(
        { accountId, typeFilter },
        actor,
        network,
        { cursor: request.cursor, signal: next.signal }
      );

      if (id !== requestId.current || next.signal.aborted) return;

      setHeld({
        state: result.ok
          ? { status: "success", page: result.value, pageIndex }
          : { status: "error", code: result.code },
        network
      });
    },
    [actor, network]
  );

  const submit = useCallback(
    async (raw: string, typeFilter: ActivityTypeFilter) => {
      const parsed = parseActivityTimelineInput(raw, typeFilter);

      if (isErr(parsed)) {
        controller.current?.abort();
        requestId.current += 1;
        trail.current = [];
        setHeld({ state: { status: "error", code: parsed.code }, network });
        return;
      }

      trail.current = [{}];
      await load(parsed.value.accountId, parsed.value.typeFilter, 0);
    },
    [load, network]
  );

  const showOlder = useCallback(async () => {
    if (state.status !== "success" || !state.page.hasMore) return;

    const pageIndex = state.pageIndex + 1;
    trail.current = trail.current.slice(0, pageIndex);
    trail.current[pageIndex] = { cursor: state.page.nextCursor ?? undefined };

    await load(state.page.accountId, state.page.typeFilter, pageIndex);
  }, [load, state]);

  const showNewer = useCallback(async () => {
    if (state.status !== "success" || state.pageIndex === 0) return;
    await load(state.page.accountId, state.page.typeFilter, state.pageIndex - 1);
  }, [load, state]);

  const reset = useCallback(() => {
    controller.current?.abort();
    requestId.current += 1;
    trail.current = [];
    setHeld({ state: IDLE, network });
  }, [network]);

  return { state, submit, showOlder, showNewer, reset };
}

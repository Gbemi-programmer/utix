"use client";

import { Card } from "@/core/ui/Card";
import { SkeletonRows } from "@/core/ui/Skeleton";
import { StatusMessage } from "@/core/ui/StatusMessage";
import { useActivityTimeline } from "@/features/activity-timeline/hooks/useActivityTimeline";
import { copy, errorCopy } from "@/features/activity-timeline/copy";
import { ActivityTimelineForm } from "@/features/activity-timeline/components/ActivityTimelineForm";
import { ActivityTimelineResult } from "@/features/activity-timeline/components/ActivityTimelineResult";
import { ActivityTimelinePager } from "@/features/activity-timeline/components/ActivityTimelinePager";
import { ActivityTimelineEmptyState } from "@/features/activity-timeline/components/ActivityTimelineEmptyState";

export function ActivityTimelinePanel() {
  const { state, submit, showOlder, showNewer } = useActivityTimeline();

  return (
    <div className="space-y-5">
      <Card>
        <ActivityTimelineForm onSubmit={submit} pending={state.status === "loading"} />
      </Card>

      {state.status === "loading" ? (
        <Card>
          <p className="sr-only" role="status">
            {copy.loading}
          </p>
          <SkeletonRows rows={4} />
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
        <>
          <ActivityTimelineResult page={state.page} />
          <ActivityTimelinePager
            pageNumber={state.pageIndex + 1}
            hasNewer={state.pageIndex > 0}
            hasOlder={state.page.hasMore}
            onNewer={showNewer}
            onOlder={showOlder}
          />
        </>
      ) : null}

      {state.status === "idle" ? <ActivityTimelineEmptyState /> : null}
    </div>
  );
}

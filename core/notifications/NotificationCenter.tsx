"use client";

import Link from "next/link";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/core/ui/Button";
import { notificationMachine, stateView } from "@/core/lifecycle/records";
import { useNotifications } from "@/core/notifications/NotificationProvider";
import type { NotificationEventType } from "@/core/notifications/types";

const eventLabels: Record<NotificationEventType, string> = {
  failure: "Needs attention",
  approval_required: "Approval required",
  completed: "Completed",
  recovery: "Recovered",
  retry: "Retry started"
};

const toneClasses: Record<NotificationEventType, string> = {
  failure: "border-[#ff9a8b] bg-[#fff0ee]",
  approval_required: "border-[#ffc3a8] bg-[#fff2e9]",
  completed: "border-[#70c7a7] bg-[#f2fbf7]",
  recovery: "border-[#82cbe3] bg-[#e0f6ff]",
  retry: "border-[#c7b9f3] bg-[#f7f5ff]"
};

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function NotificationCenter() {
  const {
    activeRecipient,
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    clear
  } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="notification-center"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative grid h-10 w-10 place-items-center rounded-md border border-[#7dbcd2]/45 bg-white/75 text-[#29364d] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#47a8c7] focus-visible:ring-offset-2"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#c4473d] px-1 text-[10px] font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          id="notification-center"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-white/90 bg-white p-3 shadow-[0_20px_60px_rgba(80,95,130,0.25)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#e3ebf5] pb-3">
            <div>
              <h2 className="text-sm font-extrabold text-[#172033]">Notifications</h2>
              <p className="truncate text-xs text-[#68758a]">{activeRecipient}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="grid h-8 w-8 place-items-center rounded-md text-[#4e5c73] hover:bg-[#f3f7fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#47a8c7]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 py-3">
            <span className="text-xs text-[#4e5c73]" aria-live="polite">
              {unreadCount ? `${unreadCount} unread` : "All caught up"}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!unreadCount}
              onClick={markAllRead}
            >
              <CheckCheck className="h-4 w-4" aria-hidden />
              Mark all read
            </Button>
          </div>

          {notifications.length ? (
            <ul className="max-h-80 space-y-2 overflow-y-auto" aria-label="Notification history">
              {notifications.map((notification) => {
                // One model: the store writes the state, this view labels it, and
                // both refuse the same transitions.
                const view = stateView("notification", notification.state);
                const canMarkRead = notificationMachine.canTransition(notification.state, "read").ok;
                return (
                <li
                  key={notification.id}
                  className={`rounded-md border p-3 ${toneClasses[notification.event]} ${
                    view.state === "unread" ? "border-l-4" : "opacity-75"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-[#4e5c73]">
                        {eventLabels[notification.event]}
                      </p>
                      <p className="mt-1 text-sm font-extrabold text-[#172033]">{notification.title}</p>
                    </div>
                    {view.state === "unread" ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#c4473d]" aria-label="Unread" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-[#4e5c73]">{notification.message}</p>
                  <p className="mt-1 text-xs text-[#68758a]">{formatTime(notification.createdAt)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href={notification.href}
                      onClick={() => markRead(notification.id)}
                      className="inline-flex min-h-8 items-center rounded-md border border-[#82cbe3] bg-white px-2 text-xs font-bold text-[#146783] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#47a8c7]"
                    >
                      Open workflow
                    </Link>
                    {canMarkRead ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => markRead(notification.id)}>
                        <Check className="h-4 w-4" aria-hidden />
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-md bg-[#f3f7fb] p-4 text-sm text-[#4e5c73]">
              No notifications for this account yet.
            </p>
          )}

          {notifications.length ? (
            <Button type="button" variant="ghost" size="sm" className="mt-3 w-full" onClick={clear}>
              Clear notifications
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

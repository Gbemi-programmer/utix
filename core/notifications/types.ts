export const NOTIFICATION_EVENTS = [
  "failure",
  "approval_required",
  "completed",
  "recovery",
  "retry"
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENTS)[number];
export type NotificationEvent = NotificationEventType;
export type NotificationRecipient = `account:${string}` | "workspace";
export type NotificationTone = "error" | "warning" | "success" | "info";

export interface NotificationInput {
  recipient: NotificationRecipient;
  event: NotificationEventType;
  tone: NotificationTone;
  title: string;
  message: string;
  href: string;
  dedupeKey: string;
  occurredAt?: number;
}

/**
 * A notification's lifecycle state, declared in `core/lifecycle/records.ts`.
 * `read` below is derived from it, so no two consumers can disagree about it.
 */
export type NotificationState = "unread" | "read" | "archived" | "purged";

export interface Notification extends NotificationInput {
  id: string;
  createdAt: string;
  /** Derived from `state`; kept so existing consumers keep compiling. */
  read: boolean;
  state: NotificationState;
}

export interface NotificationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

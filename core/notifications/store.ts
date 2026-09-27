import { recordAudit } from "@/core/audit/audit";
import { notificationMachine, transitionRecord } from "@/core/lifecycle/records";
import {
  NOTIFICATION_EVENTS,
  type Notification,
  type NotificationEventType,
  type NotificationInput,
  type NotificationRecipient,
  type NotificationState,
  type NotificationStorage,
  type NotificationTone
} from "@/core/notifications/types";

const STORAGE_PREFIX = "utix:notifications:v1:";
/** The initial state, taken from the lifecycle table rather than repeated. */
const INITIAL_STATE = notificationMachine.initial() as NotificationState;
const READ_STATE: NotificationState = "read";

const PUBLIC_ACCOUNT = /^account:G[A-Z2-7]{55}$/;
const SECRET = /\bS[A-Z2-7]{55}\b/g;

class MemoryStorage implements NotificationStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function browserStorage(): NotificationStorage {
  try {
    if (
      typeof window !== "undefined" &&
      window.localStorage &&
      typeof window.localStorage.getItem === "function"
    ) {
      return window.localStorage;
    }
  } catch {
    return new MemoryStorage();
  }
  return new MemoryStorage();
}

function isNotificationEvent(value: unknown): value is NotificationEventType {
  return typeof value === "string" && (NOTIFICATION_EVENTS as readonly string[]).includes(value);
}

function isNotificationTone(value: unknown): value is NotificationTone {
  return value === "error" || value === "warning" || value === "success" || value === "info";
}

function isNotificationRecipient(value: unknown): value is NotificationRecipient {
  return value === "workspace" || (typeof value === "string" && PUBLIC_ACCOUNT.test(value));
}

function isSafeHref(value: string): boolean {
  return /^\/(?!\/)\S*$/.test(value) && !value.toLowerCase().includes("javascript:");
}

function containsSecret(value: string): boolean {
  return value.replace(SECRET, "") !== value;
}

function scrub(value: string, maxLength: number): string {
  return value.replace(SECRET, "[REDACTED]").slice(0, maxLength);
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return `notification-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function isNotificationState(value: unknown): value is NotificationState {
  return notificationMachine.isState(value) && value !== "purged";
}

/**
 * Accepts a stored entry and normalises it to the lifecycle model. Entries
 * written before the state field existed are migrated from their `read` flag,
 * so an existing browser profile keeps working.
 */
function parseNotification(value: unknown): Notification | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<Notification>;
  if (
    typeof item.id !== "string" ||
    typeof item.recipient !== "string" ||
    !isNotificationRecipient(item.recipient) ||
    !isNotificationEvent(item.event) ||
    !isNotificationTone(item.tone) ||
    typeof item.title !== "string" ||
    typeof item.message !== "string" ||
    typeof item.href !== "string" ||
    containsSecret(item.title) ||
    containsSecret(item.message) ||
    containsSecret(item.href) ||
    !isSafeHref(item.href) ||
    typeof item.dedupeKey !== "string" ||
    typeof item.createdAt !== "string"
  ) {
    return null;
  }

  const state: NotificationState = isNotificationState(item.state)
    ? item.state
    : item.read === true
      ? READ_STATE
      : INITIAL_STATE;

  return {
    id: item.id,
    recipient: item.recipient,
    event: item.event,
    tone: item.tone,
    title: item.title,
    message: item.message,
    href: item.href,
    dedupeKey: item.dedupeKey,
    createdAt: item.createdAt,
    state,
    // Derived once, from the single source of truth.
    read: state === READ_STATE || state === "archived"
  };
}

export class NotificationStore {
  private readonly storage: NotificationStorage;
  private readonly maxEntries: number;

  constructor(storage: NotificationStorage = browserStorage(), maxEntries = 50) {
    this.storage = storage;
    this.maxEntries = Math.max(1, Math.floor(maxEntries));
  }

  private key(recipient: NotificationRecipient): string {
    return `${STORAGE_PREFIX}${recipient}`;
  }

  private read(recipient: NotificationRecipient): Notification[] {
    const raw = this.storage.getItem(this.key(recipient));
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(parseNotification)
        .filter((item): item is Notification => item !== null)
        .filter((item) => item.recipient === recipient);
    } catch {
      return [];
    }
  }

  private write(recipient: NotificationRecipient, notifications: Notification[]): void {
    this.storage.setItem(this.key(recipient), JSON.stringify(notifications.slice(0, this.maxEntries)));
  }

  list(recipient: NotificationRecipient): Notification[] {
    if (!isNotificationRecipient(recipient)) return [];
    return this.read(recipient).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  unreadCount(recipient: NotificationRecipient): number {
    // Derived from the lifecycle state, not from a second boolean.
    return this.list(recipient).filter((notification) => notification.state === "unread").length;
  }

  publish(input: NotificationInput): Notification | null {
    if (
      !isNotificationRecipient(input.recipient) ||
      !isNotificationEvent(input.event) ||
      !isNotificationTone(input.tone) ||
      typeof input.title !== "string" ||
      typeof input.message !== "string" ||
      typeof input.href !== "string" ||
      typeof input.dedupeKey !== "string" ||
      !isSafeHref(input.href) ||
      !input.dedupeKey.trim()
    ) {
      return null;
    }

    const dedupeKey = scrub(input.dedupeKey, 160);
    const existing = this.read(input.recipient);
    const duplicate = existing.find(
      (notification) => notification.event === input.event && notification.dedupeKey === dedupeKey
    );
    if (duplicate) return duplicate;

    const timestamp = input.occurredAt ?? Date.now();
    const createdAt = new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
    const href = scrub(input.href, 1000);
    const notification: Notification = {
      id: stableId(`${input.recipient}|${input.event}|${dedupeKey}`),
      recipient: input.recipient,
      event: input.event,
      tone: input.tone,
      title: scrub(input.title, 120),
      message: scrub(input.message, 500),
      href,
      dedupeKey,
      createdAt,
      state: INITIAL_STATE,
      read: false
    };

    this.write(input.recipient, [notification, ...existing]);
    recordAudit({
      action: "notification.published",
      actor: { kind: "user", id: input.recipient },
      target: { kind: "notification", id: notification.id },
      after: { event: input.event, tone: input.tone },
      at: createdAt,
      reason: notification.dedupeKey
    });
    return notification;
  }

  /**
   * Moves a notification to `read`. Returns `null` when the record is unknown
   * *or* when the lifecycle table refuses the move (an already-read or archived
   * notification), so a double click cannot re-fire the write.
   */
  markRead(recipient: NotificationRecipient, id: string): Notification | null {
    if (!isNotificationRecipient(recipient)) return null;
    const notifications = this.read(recipient);
    const index = notifications.findIndex((notification) => notification.id === id);
    if (index < 0) return null;
    const current = notifications[index];
    const moved = transitionRecord("notification", current.id, current.state, "read", {
      actor: `account:${recipient.startsWith("account:") ? recipient.slice(8) : "workspace"}`
    });
    if (!moved.ok) return null;
    const notification: Notification = { ...current, state: READ_STATE, read: true };
    notifications[index] = notification;
    this.write(recipient, notifications);
    return notification;
  }

  /** Applies `read` to every entry that still allows it; already-read stay put. */
  markAllRead(recipient: NotificationRecipient): Notification[] {
    if (!isNotificationRecipient(recipient)) return [];
    const notifications = this.read(recipient).map((notification) => {
      if (!notificationMachine.canTransition(notification.state, "read").ok) return notification;
      transitionRecord("notification", notification.id, notification.state, "read");
      return { ...notification, state: READ_STATE, read: true };
    });
    this.write(recipient, notifications);
    return notifications;
  }

  /** Removes every record for a recipient. Purging is terminal and one-way. */
  clear(recipient: NotificationRecipient): void {
    if (!isNotificationRecipient(recipient)) return;
    const existing = this.read(recipient);
    recordAudit({
      action: "notification.cleared",
      actor: { kind: "user", id: recipient },
      target: { kind: "notification", id: recipient },
      before: { count: existing.length },
      reason: "recipient_cleared"
    });
    for (const notification of existing) {
      transitionRecord("notification", notification.id, notification.state, "purge", {
        reason: "recipient_cleared"
      });
    }
    this.storage.removeItem(this.key(recipient));
  }
}

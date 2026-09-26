import { describe, expect, it } from "vitest";
import { NotificationStore } from "@/core/notifications/store";
import type { NotificationStorage } from "@/core/notifications/types";

class TestStorage implements NotificationStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const account = `account:${`G${"A".repeat(55)}`}` as const;
const otherAccount = `account:${`G${"B".repeat(55)}`}` as const;

describe("NotificationStore", () => {
  it("persists notifications per recipient and deduplicates events", () => {
    const storage = new TestStorage();
    const first = new NotificationStore(storage);
    const input = {
      recipient: account,
      event: "completed" as const,
      tone: "success" as const,
      title: "Loaded",
      message: "History is ready",
      href: "/tools/operation-browser?account=GAA",
      dedupeKey: "history:1"
    };

    const created = first.publish(input);
    const duplicate = first.publish(input);

    expect(created).not.toBeNull();
    expect(duplicate?.id).toBe(created?.id);
    expect(new NotificationStore(storage).list(account)).toHaveLength(1);
    expect(new NotificationStore(storage).list(otherAccount)).toHaveLength(0);
  });

  it("tracks read state and unread count", () => {
    const store = new NotificationStore(new TestStorage());
    const created = store.publish({
      recipient: account,
      event: "failure",
      tone: "error",
      title: "Needs attention",
      message: "Try again",
      href: "/tools/operation-browser",
      dedupeKey: "failure:1"
    });

    expect(created).not.toBeNull();
    expect(store.unreadCount(account)).toBe(1);
    expect(store.markRead(account, created!.id)?.read).toBe(true);
    expect(store.unreadCount(account)).toBe(0);
    store.markAllRead(otherAccount);
    expect(store.list(otherAccount)).toEqual([]);
  });

  it("redacts secrets and rejects unsafe deep links", () => {
    const store = new NotificationStore(new TestStorage());
    const secret = `S${"A".repeat(55)}`;
    const notification = store.publish({
      recipient: account,
      event: "failure",
      tone: "error",
      title: `Failure ${secret}`,
      message: `Do not expose ${secret}`,
      href: `/tools/operation-browser?note=${secret}`,
      dedupeKey: `failure:${secret}`
    });
    const unsafe = store.publish({
      recipient: account,
      event: "completed",
      tone: "success",
      title: "Unsafe",
      message: "Unsafe",
      href: "https://example.com",
      dedupeKey: "unsafe"
    });

    expect(notification?.title).not.toContain(secret);
    expect(notification?.message).not.toContain(secret);
    expect(notification?.href).toContain("[REDACTED]");
    expect(unsafe).toBeNull();
  });

  it("keeps the newest bounded history", () => {
    const store = new NotificationStore(new TestStorage(), 2);
    for (let index = 0; index < 3; index += 1) {
      store.publish({
        recipient: account,
        event: "completed",
        tone: "success",
        title: `Loaded ${index}`,
        message: "Done",
        href: "/tools/operation-browser",
        dedupeKey: `event:${index}`,
        occurredAt: index
      });
    }

    expect(store.list(account).map((notification) => notification.dedupeKey)).toEqual(["event:2", "event:1"]);
  });
});

describe("NotificationStore lifecycle", () => {
  const input = {
    recipient: account,
    event: "failure" as const,
    tone: "error" as const,
    title: "Needs attention",
    message: "Try again",
    href: "/tools/operation-browser",
    dedupeKey: "failure:1"
  };

  it("derives the read flag from the lifecycle state, not a second source", () => {
    const store = new NotificationStore(new TestStorage());
    const created = store.publish(input)!;

    expect(created.state).toBe("unread");
    expect(created.read).toBe(false);

    const marked = store.markRead(account, created.id)!;
    expect(marked.state).toBe("read");
    expect(marked.read).toBe(true);
    expect(store.list(account)[0]).toMatchObject({ state: "read", read: true });
  });

  it("refuses a second read transition instead of rewriting the record", () => {
    const store = new NotificationStore(new TestStorage());
    const created = store.publish(input)!;
    expect(store.markRead(account, created.id)).not.toBeNull();

    // `read` is terminal for that move: a double click must not re-fire.
    expect(store.markRead(account, created.id)).toBeNull();
    expect(store.list(account)).toHaveLength(1);
  });

  it("migrates an entry stored before the state field existed", () => {
    const storage = new TestStorage();
    const legacy = new NotificationStore(storage);
    legacy.publish(input);
    const key = `utix:notifications:v1:${account}`;
    const stored = JSON.parse(storage.getItem(key)!);
    delete stored[0].state;
    stored[0].read = true;
    storage.setItem(key, JSON.stringify(stored));

    const migrated = new NotificationStore(storage).list(account)[0];
    expect(migrated.state).toBe("read");
    expect(migrated.read).toBe(true);
  });

  it("purges on clear and keeps markAllRead idempotent", () => {
    const storage = new TestStorage();
    const store = new NotificationStore(storage);
    const first = store.publish(input)!;
    store.publish({ ...input, dedupeKey: "failure:2" });

    expect(store.markAllRead(account).map((n) => n.state)).toEqual(["read", "read"]);
    expect(store.unreadCount(account)).toBe(0);
    expect(store.list(account).map((n) => n.id).sort()).toContain(first.id);
    expect(store.list(account)).toHaveLength(2);

    store.clear(account);
    expect(store.list(account)).toEqual([]);
  });
});

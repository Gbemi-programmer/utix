// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipboardError, copyText, tryCopyText } from "@/core/lib/clipboard";
import { CopyableValue } from "@/core/ui/CopyableValue";

const HASH = "a".repeat(64);

function mockClipboard(writeText?: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: writeText ? { writeText } : undefined
  });
}

function mockExecCommand(result: boolean) {
  const fn = vi.fn(() => result);
  Object.defineProperty(document, "execCommand", { configurable: true, value: fn });
  return fn;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockClipboard();
});

describe("copyText", () => {
  it("writes through the async clipboard API", async () => {
    const writeText = vi.fn(async () => {});
    mockClipboard(writeText);
    await copyText(HASH);
    expect(writeText).toHaveBeenCalledWith(HASH);
  });

  it("throws a typed error when the API is missing", async () => {
    mockClipboard();
    await expect(copyText(HASH)).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("throws a typed error when permission is denied", async () => {
    mockClipboard(() => Promise.reject(new DOMException("denied", "NotAllowedError")));
    const error = await copyText(HASH).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClipboardError);
    expect((error as ClipboardError).reason).toBe("denied");
  });
});

describe("tryCopyText fallback selection", () => {
  it("does not touch the legacy path when the API works", async () => {
    mockClipboard(async () => {});
    const exec = mockExecCommand(true);
    await expect(tryCopyText(HASH)).resolves.toBe("copied");
    expect(exec).not.toHaveBeenCalled();
  });

  it("uses execCommand when the API is unavailable", async () => {
    mockClipboard();
    const exec = mockExecCommand(true);
    await expect(tryCopyText(HASH)).resolves.toBe("copied");
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("reports the real failure when the legacy copy also fails", async () => {
    mockClipboard(() => Promise.reject(new Error("nope")));
    mockExecCommand(false);
    await expect(tryCopyText(HASH)).resolves.toBe("denied");
    mockClipboard();
    await expect(tryCopyText(HASH)).resolves.toBe("unavailable");
  });
});

describe("CopyableValue", () => {
  it("announces success", async () => {
    mockClipboard(async () => {});
    render(<CopyableValue label="transaction hash" value={HASH} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy transaction hash" }));
    expect(await screen.findByText("transaction hash copied to clipboard")).toBeTruthy();
  });

  it("shows an actionable fallback with the full value instead of claiming success", async () => {
    mockClipboard(() => Promise.reject(new Error("denied")));
    mockExecCommand(false);
    render(<CopyableValue label="transaction hash" value={HASH} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy transaction hash" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not copy transaction hash");
    expect(screen.getByTestId("copy-fallback-value").textContent).toBe(HASH);
    expect(screen.queryByText("transaction hash copied to clipboard")).toBeNull();
  });
});

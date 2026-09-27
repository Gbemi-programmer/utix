export type ClipboardFailure = "unavailable" | "denied";

/** Thrown by `copyText`; `reason` lets UI callers show the right guidance. */
export class ClipboardError extends Error {
  constructor(readonly reason: ClipboardFailure) {
    super(
      reason === "unavailable"
        ? "Clipboard access is not available in this browser."
        : "Clipboard access was denied."
    );
    this.name = "ClipboardError";
  }
}

/** Low-level boundary: throws a `ClipboardError` on any failure. */
export async function copyText(value: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new ClipboardError("unavailable");
  }

  try {
    await navigator.clipboard.writeText(value);
  } catch {
    throw new ClipboardError("denied");
  }
}

/**
 * Legacy `execCommand("copy")` path for browsers without the async API or
 * where it is denied. Reports success only when the browser says it copied.
 */
function legacyCopy(value: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

export type CopyOutcome = "copied" | ClipboardFailure;

/** UI-safe copy: never throws, and only reports "copied" when a copy happened. */
export async function tryCopyText(value: string): Promise<CopyOutcome> {
  try {
    await copyText(value);
    return "copied";
  } catch (error) {
    if (legacyCopy(value)) return "copied";
    return error instanceof ClipboardError ? error.reason : "denied";
  }
}

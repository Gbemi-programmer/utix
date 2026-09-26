import type { Page } from "@playwright/test";

/**
 * Keyboard-only navigation assertions for the app shell.
 *
 * Every helper moves focus with real key presses and then reads
 * `document.activeElement`; none of them clicks or focuses programmatically.
 * They throw a plain `KeyboardNavigationError`, so a fixture test can assert
 * that a broken page is rejected.
 */

export class KeyboardNavigationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KeyboardNavigationError";
  }
}

export interface FocusedElement {
  /** Stable per-element id, assigned on first sight and kept for the page's life. */
  id: number;
  description: string;
  href: string | null;
  inMain: boolean;
}

/** Describes the focused element; ids let callers detect a revisit (a cycle). */
export function focused(page: Page): Promise<FocusedElement> {
  return page.evaluate(() => {
    const state = window as unknown as { __kbdIds?: WeakMap<Element, number>; __kbdNext?: number };
    state.__kbdIds ??= new WeakMap();
    state.__kbdNext ??= 1;

    const element = document.activeElement ?? document.body;
    let id = state.__kbdIds.get(element);
    if (id === undefined) {
      id = state.__kbdNext++;
      state.__kbdIds.set(element, id);
    }

    const name =
      element.getAttribute("aria-label") ??
      (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    return {
      id,
      description: `<${element.tagName.toLowerCase()}> "${name}"`,
      href: element instanceof HTMLAnchorElement ? element.getAttribute("href") : null,
      inMain: Boolean(document.getElementById("main-content")?.contains(element))
    };
  });
}

const EXPECTED_STOP = "data-kbd-expected-stop";

/**
 * Marks the first tab stop inside `#main-content` in sequential focus order,
 * following the HTML rules: disabled, hidden and `tabindex="-1"` elements are
 * skipped, only one radio per group is a stop, and positive `tabindex` values
 * come first. Returns false when the main content has no tab stop at all.
 */
function markFirstTabStopInMain(page: Page): Promise<boolean> {
  return page.evaluate((attribute) => {
    const main = document.getElementById("main-content");
    if (!main) return false;

    const stops = Array.from(
      main.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable="true"]'
      )
    ).filter((element) => {
      if (element.tabIndex < 0 || (element as HTMLButtonElement).disabled) return false;
      if (element instanceof HTMLInputElement && element.type === "hidden") return false;
      if (!element.checkVisibility({ visibilityProperty: true })) return false;
      if (!(element instanceof HTMLInputElement) || element.type !== "radio" || !element.name) {
        return true;
      }
      const group = Array.from(
        main.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(element.name)}"]`)
      );
      return element === (group.find((radio) => radio.checked) ?? group[0]);
    });

    const positive = stops.filter((element) => element.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex);
    const first = positive[0] ?? stops[0];
    first?.setAttribute(attribute, "");
    return Boolean(first);
  }, EXPECTED_STOP);
}

/**
 * Presses Tab until `matches` accepts the focused element. Fails if focus
 * stops moving or returns to an element it already visited before reaching the
 * target — either is a keyboard trap or an unreachable target. At most
 * `maxPresses` presses, so time is O(maxPresses).
 */
export async function tabUntil(
  page: Page,
  matches: (element: FocusedElement) => boolean,
  target: string,
  maxPresses = 200
): Promise<FocusedElement> {
  const visited = new Set<number>();

  for (let press = 1; press <= maxPresses; press += 1) {
    await page.keyboard.press("Tab");
    const element = await focused(page);
    if (matches(element)) return element;

    if (visited.has(element.id)) {
      throw new KeyboardNavigationError(
        `Focus returned to ${element.description} after ${press} Tab presses without reaching ${target}.`
      );
    }
    visited.add(element.id);
  }

  throw new KeyboardNavigationError(`${target} was not reached within ${maxPresses} Tab presses.`);
}

/** The first Tab on a freshly loaded page must land on the visible skip link. */
export async function expectSkipLinkFirst(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  const element = await focused(page);
  if (element.href !== "#main-content") {
    throw new KeyboardNavigationError(
      `The first Tab stop is ${element.description}, not the "Skip to main content" link.`
    );
  }

  const visible = await page.evaluate(() => {
    const rect = document.activeElement?.getBoundingClientRect();
    return Boolean(rect && rect.width > 1 && rect.height > 1);
  });
  if (!visible) {
    throw new KeyboardNavigationError("The skip link stays visually hidden while it has focus.");
  }
}

function isOnExpectedStop(page: Page): Promise<boolean> {
  return page.evaluate(
    (attribute) => document.activeElement?.hasAttribute(attribute) ?? false,
    EXPECTED_STOP
  );
}

/** How long a slice may show only a loading state (e.g. wallet detection) before it must offer a control. */
const SETTLE_MS = 10_000;

async function requireTabStopInMain(page: Page): Promise<void> {
  const deadline = Date.now() + SETTLE_MS;
  while (!(await markFirstTabStopInMain(page))) {
    if (Date.now() >= deadline) {
      throw new KeyboardNavigationError("The main content has no keyboard-reachable control.");
    }
    await page.waitForTimeout(100);
  }
}

/**
 * Activates the focused skip link and checks the next Tab lands on the first
 * tab stop of the main content — i.e. the shell is bypassed in one step.
 */
export async function expectSkipLinkReachesMain(page: Page): Promise<void> {
  await page.keyboard.press("Enter");
  await requireTabStopInMain(page);

  await page.keyboard.press("Tab");
  if (!(await isOnExpectedStop(page))) {
    const element = await focused(page);
    throw new KeyboardNavigationError(
      `After the skip link, Tab moved to ${element.description} instead of the first control in the main content.`
    );
  }
}

/**
 * From focus in the shell, tabbing forward must enter the main content at its
 * first tab stop — the boundary where shell and slice focus order meet.
 */
export async function expectShellHandsFocusToMain(page: Page): Promise<void> {
  await requireTabStopInMain(page);

  const element = await tabUntil(page, (current) => current.inMain, "the main content");
  if (!(await isOnExpectedStop(page))) {
    throw new KeyboardNavigationError(
      `Focus entered the main content at ${element.description} instead of its first control.`
    );
  }
}

/**
 * From focus inside the main content, Tab forward must eventually leave it.
 * `maxPresses` bounds the walk; a focus cycle inside main is a keyboard trap.
 */
export async function expectFocusLeavesMain(page: Page, maxPresses = 200): Promise<void> {
  await tabUntil(page, (current) => !current.inMain, "the end of the main content", maxPresses);
}

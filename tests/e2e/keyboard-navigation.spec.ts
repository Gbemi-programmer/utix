import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { featureHref, manifests } from "@/core/registry/manifests";
import {
  expectFocusLeavesMain,
  expectShellHandsFocusToMain,
  expectSkipLinkFirst,
  expectSkipLinkReachesMain,
  focused,
  tabUntil
} from "./keyboard";

/**
 * Keyboard-only journeys through the app shell into every registered tool.
 *
 * The tool list comes from the generated registry, so a new feature slice is
 * covered the moment its directory exists. The desktop viewport keeps the
 * sidebar navigation on screen; the mobile menu is a separate surface.
 */

test.use({ viewport: { width: 1280, height: 800 } });

/** `npm run dev` compiles each tool route on its first request, which can take many seconds. */
const FIRST_COMPILE_MS = 60_000;

test.describe("keyboard navigation from the landing page", () => {
  test.describe.configure({ mode: "parallel", timeout: 3 * FIRST_COMPILE_MS });

  for (const manifest of manifests) {
    const href = featureHref(manifest.slug);

    test(`reaches ${manifest.title} and its controls without a mouse`, async ({ page }) => {
      await page.goto("/", { timeout: FIRST_COMPILE_MS });
      await page.waitForLoadState("networkidle", { timeout: FIRST_COMPILE_MS });

      await expectSkipLinkFirst(page);

      // Header and sidebar in order, with no trap, up to this tool's link.
      await tabUntil(page, (element) => element.href === href, `the "${manifest.title}" link`);
      await page.keyboard.press("Enter");

      await expect(page).toHaveURL(href, { timeout: FIRST_COMPILE_MS });
      await expect(page.getByRole("heading", { level: 1, name: manifest.title })).toBeVisible({
        timeout: FIRST_COMPILE_MS
      });

      // Past the rest of the shell, the next stop is the slice's first control.
      await expectShellHandsFocusToMain(page);

      // The slice must hand focus back instead of trapping it.
      await expectFocusLeavesMain(page);
    });

    test(`skips straight to the ${manifest.title} controls`, async ({ page }) => {
      await page.goto(href, { timeout: FIRST_COMPILE_MS });
      await page.waitForLoadState("networkidle", { timeout: FIRST_COMPILE_MS });

      await expectSkipLinkFirst(page);
      await expectSkipLinkReachesMain(page);
      expect((await focused(page)).inMain).toBe(true);
    });
  }
});

/**
 * The helpers above must fail on a real regression, not pass vacuously. These
 * fixtures break the shell/slice boundary on purpose.
 */
test.describe("keyboard assertions reject broken pages", () => {
  const fixture = (name: string) =>
    readFileSync(path.join(__dirname, "fixtures", name), "utf8");

  test("a correct page passes", async ({ page }) => {
    await page.setContent(fixture("keyboard-shell.html"));

    await expectSkipLinkFirst(page);
    await expectShellHandsFocusToMain(page);
    await expectFocusLeavesMain(page);

    await page.setContent(fixture("keyboard-shell.html"));
    await expectSkipLinkFirst(page);
    await expectSkipLinkReachesMain(page);
  });

  test("a slice control that jumps ahead of the skip link fails", async ({ page }) => {
    await page.setContent(fixture("keyboard-shell-broken-order.html"));

    await expect(expectSkipLinkFirst(page)).rejects.toThrow(/not the "Skip to main content" link/);
  });

  test("a slice control that swallows Tab fails as a keyboard trap", async ({ page }) => {
    await page.setContent(fixture("keyboard-shell-trap.html"));

    await expectSkipLinkFirst(page);
    await expectSkipLinkReachesMain(page);
    await expect(expectFocusLeavesMain(page)).rejects.toThrow(/without reaching the end of the main content/);
  });
});

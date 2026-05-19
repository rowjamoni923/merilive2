import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

/**
 * Shop full-screen preview E2E.
 *
 * Verifies the four shop tabs (Avatar Frames, Entry Effects, Vehicles, Chat Bubbles):
 *   1) render their items,
 *   2) open a full-screen preview when an item is clicked,
 *   3) do NOT trigger any page reload when switching tabs or opening previews.
 *
 * The "no reload" guarantee mirrors the app-wide rule: tab switches and
 * preview opens must be in-place state updates, never `window.location.reload`
 * or full navigations.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = pathToFileURL(
  path.resolve(__dirname, "fixtures/shop-preview-harness.html"),
).toString();

const TABS = [
  { label: "Avatar Frames", id: "avatar_frames", firstItem: { id: "af1", name: "Gold Frame" } },
  { label: "Entry Effects", id: "entry_effects", firstItem: { id: "ee1", name: "Dragon Entry" } },
  { label: "Vehicles",      id: "vehicles",      firstItem: { id: "v1",  name: "Sports Car" } },
  { label: "Chat Bubbles",  id: "chat_bubbles",  firstItem: { id: "cb1", name: "Royal Bubble" } },
] as const;

test.describe("Shop — full-screen preview (no reload)", () => {
  test.beforeEach(async ({ page }) => {
    // Fresh session so __RELOAD_COUNT__ starts at 1.
    await page.context().clearCookies();
    await page.addInitScript(() => {
      try { sessionStorage.clear(); } catch {}
    });
    await page.goto(HARNESS_URL);
    expect(await page.evaluate(() => (window as any).__RELOAD_COUNT__)).toBe(1);
  });

  for (const tab of TABS) {
    test(`${tab.label}: opens full-screen preview without reload`, async ({ page }) => {
      // Switch to the tab.
      await page.getByRole("tab", { name: tab.label }).click();
      await expect(page.locator("#grid")).toHaveAttribute("data-active-tab", tab.id);

      // Items rendered.
      const items = page.getByTestId("shop-item");
      await expect(items.first()).toBeVisible();
      expect(await items.count()).toBeGreaterThan(0);

      // Open preview.
      await page.locator(`[data-testid="shop-item"][data-id="${tab.firstItem.id}"]`).click();
      const modal = page.locator("#modal");
      await expect(modal).toHaveAttribute("data-open", "true");
      await expect(modal).toHaveAttribute("data-from-tab", tab.id);
      await expect(modal).toHaveAttribute("data-item-id", tab.firstItem.id);
      await expect(page.getByTestId("preview-title")).toHaveText(tab.firstItem.name);
      await expect(page.getByTestId("preview-media")).toHaveAttribute("data-src", /\S+/);

      // No reload, no navigation.
      expect(await page.evaluate(() => (window as any).__RELOAD_COUNT__)).toBe(1);
      expect(await page.evaluate(() => (window as any).__NAV_EVENTS__)).toEqual([]);

      // Close and reopen → still no reload.
      await page.getByTestId("preview-close").click();
      await expect(modal).toHaveAttribute("data-open", "false");
      await page.locator(`[data-testid="shop-item"][data-id="${tab.firstItem.id}"]`).click();
      await expect(modal).toHaveAttribute("data-open", "true");
      expect(await page.evaluate(() => (window as any).__RELOAD_COUNT__)).toBe(1);
    });
  }

  test("Switching across all four tabs and opening previews never reloads the page", async ({ page }) => {
    for (const tab of TABS) {
      await page.getByRole("tab", { name: tab.label }).click();
      await expect(page.locator("#grid")).toHaveAttribute("data-active-tab", tab.id);
      await page.locator(`[data-testid="shop-item"][data-id="${tab.firstItem.id}"]`).click();
      await expect(page.locator("#modal")).toHaveAttribute("data-open", "true");
      await page.getByTestId("preview-close").click();
      await expect(page.locator("#modal")).toHaveAttribute("data-open", "false");
    }

    expect(await page.evaluate(() => (window as any).__RELOAD_COUNT__)).toBe(1);
    expect(await page.evaluate(() => (window as any).__NAV_EVENTS__)).toEqual([]);
  });
});

import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

/**
 * Click-behavior E2E: clicking Approve / Reject on a pending card must
 *   1) dispatch the correct action with the correct submission id,
 *   2) flip the row's status (pending → approved / rejected),
 *   3) remove the card from the Pending tab on next render,
 *   4) make the row appear in the destination tab with NO action buttons.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = pathToFileURL(
  path.resolve(__dirname, "fixtures/face-tab-harness.html"),
).toString();

test.describe("Face verification — Pending Approve/Reject click behavior", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    // Sanity: harness exposes its action log.
    expect(await page.evaluate(() => Array.isArray((window as any).__ACTIONS__))).toBe(true);
  });

  test("Approve click: dispatches approve action, removes card from Pending, lands in Approved with no buttons", async ({ page }) => {
    await page.getByRole("tab", { name: "Pending" }).click();
    const target = page.locator('[data-testid="submission-card"][data-id="p1"]');
    await expect(target).toBeVisible();
    const approvedCountBefore = await page.evaluate(async () => {
      const tab = document.querySelector('[data-tab="approved"]') as HTMLElement;
      tab.click();
      const n = document.querySelectorAll('[data-testid="submission-card"]').length;
      (document.querySelector('[data-tab="pending"]') as HTMLElement).click();
      return n;
    });

    await target.getByTestId("approve-btn").click();

    // 1) Action dispatched with correct payload.
    const actions = await page.evaluate(() => (window as any).__ACTIONS__);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: "approve", id: "p1", prev: "pending", next: "approved" });

    // 2) Banner reflects the action.
    const banner = page.getByTestId("last-action");
    await expect(banner).toHaveAttribute("data-action", "approve");
    await expect(banner).toHaveAttribute("data-id", "p1");
    await expect(banner).toHaveAttribute("data-next", "approved");

    // 3) Removed from Pending.
    await expect(page.locator('[data-testid="submission-card"][data-id="p1"]')).toHaveCount(0);

    // 4) Now in Approved tab WITHOUT action buttons.
    await page.getByRole("tab", { name: "Approved" }).click();
    const moved = page.locator('[data-testid="submission-card"][data-id="p1"]');
    await expect(moved).toBeVisible();
    await expect(moved).toHaveAttribute("data-bucket", "approved");
    await expect(moved).toHaveAttribute("data-status", "approved");
    await expect(moved.getByTestId("approve-btn")).toHaveCount(0);
    await expect(moved.getByTestId("reject-btn")).toHaveCount(0);
    expect(await page.getByTestId("submission-card").count()).toBe(approvedCountBefore + 1);
  });

  test("Reject click: dispatches reject action, removes card from Pending, lands in Rejected with no buttons", async ({ page }) => {
    await page.getByRole("tab", { name: "Pending" }).click();
    const target = page.locator('[data-testid="submission-card"][data-id="p2"]');
    await expect(target).toBeVisible();

    await target.getByTestId("reject-btn").click();

    const actions = await page.evaluate(() => (window as any).__ACTIONS__);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ action: "reject", id: "p2", prev: "submitted", next: "rejected" });

    await expect(page.getByTestId("last-action")).toHaveAttribute("data-action", "reject");
    await expect(page.locator('[data-testid="submission-card"][data-id="p2"]')).toHaveCount(0);

    await page.getByRole("tab", { name: "Rejected" }).click();
    const moved = page.locator('[data-testid="submission-card"][data-id="p2"]');
    await expect(moved).toBeVisible();
    await expect(moved).toHaveAttribute("data-bucket", "rejected");
    await expect(moved.getByTestId("approve-btn")).toHaveCount(0);
    await expect(moved.getByTestId("reject-btn")).toHaveCount(0);
  });

  test("Clicks only fire on the card whose button was pressed (no cross-row leak)", async ({ page }) => {
    await page.getByRole("tab", { name: "Pending" }).click();
    const pendingIdsBefore = await page
      .getByTestId("submission-card")
      .evaluateAll(els => els.map(e => e.getAttribute("data-id")));
    expect(pendingIdsBefore).toEqual(expect.arrayContaining(["p1", "p2", "p3"]));

    await page.locator('[data-testid="submission-card"][data-id="p3"] [data-testid="approve-btn"]').click();

    const actions = await page.evaluate(() => (window as any).__ACTIONS__);
    expect(actions).toEqual([
      expect.objectContaining({ action: "approve", id: "p3" }),
    ]);

    // p1, p2 still in Pending; p3 gone.
    await expect(page.locator('[data-testid="submission-card"][data-id="p1"]')).toBeVisible();
    await expect(page.locator('[data-testid="submission-card"][data-id="p2"]')).toBeVisible();
    await expect(page.locator('[data-testid="submission-card"][data-id="p3"]')).toHaveCount(0);
  });

  test("Sequential approve+reject: action log preserves order and final tabs reflect both moves", async ({ page }) => {
    await page.getByRole("tab", { name: "Pending" }).click();
    await page.locator('[data-testid="submission-card"][data-id="p1"] [data-testid="approve-btn"]').click();
    await page.locator('[data-testid="submission-card"][data-id="p2"] [data-testid="reject-btn"]').click();

    const actions = await page.evaluate(() => (window as any).__ACTIONS__);
    expect(actions.map((a: any) => `${a.action}:${a.id}`)).toEqual(["approve:p1", "reject:p2"]);

    // Pending now only contains p3 (the originally unknown-status row).
    await expect(page.getByTestId("submission-card")).toHaveCount(1);
    await expect(page.locator('[data-testid="submission-card"][data-id="p3"]')).toBeVisible();

    await page.getByRole("tab", { name: "Approved" }).click();
    await expect(page.locator('[data-testid="submission-card"][data-id="p1"]')).toBeVisible();

    await page.getByRole("tab", { name: "Rejected" }).click();
    await expect(page.locator('[data-testid="submission-card"][data-id="p2"]')).toBeVisible();
  });
});

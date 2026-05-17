import { test, expect } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

/**
 * End-to-end regression: Pending tab must show Approve/Reject buttons on
 * pending-bucket cards ONLY. Approved/Rejected/All tabs must NOT show those
 * buttons on any card.
 *
 * The harness mirrors src/lib/admin/statusCounts.ts bucketOfStatus exactly
 * (Vitest test faceTabVisibility.test.ts guards the source of truth).
 *
 * No admin auth, no Supabase, no Vite — runs against a static HTML fixture
 * so it's deterministic and CI-friendly.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = pathToFileURL(
  path.resolve(__dirname, "fixtures/face-tab-harness.html"),
).toString();

test.describe("Face verification — tab + Approve/Reject button visibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
  });

  test("Pending tab: every visible card has Approve & Reject buttons", async ({ page }) => {
    await page.getByRole("tab", { name: "Pending" }).click();
    const cards = page.getByTestId("submission-card");
    await expect(cards).toHaveCount(3); // p1, p2, p3
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute("data-bucket", "pending");
      await expect(card.getByTestId("approve-btn")).toBeVisible();
      await expect(card.getByTestId("reject-btn")).toBeVisible();
    }
  });

  test("Approved tab: NO card has Approve or Reject buttons", async ({ page }) => {
    await page.getByRole("tab", { name: "Approved" }).click();
    const cards = page.getByTestId("submission-card");
    await expect(cards).toHaveCount(2); // a1, a2
    await expect(page.getByTestId("approve-btn")).toHaveCount(0);
    await expect(page.getByTestId("reject-btn")).toHaveCount(0);
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i)).toHaveAttribute("data-bucket", "approved");
    }
  });

  test("Rejected tab: NO card has Approve or Reject buttons", async ({ page }) => {
    await page.getByRole("tab", { name: "Rejected" }).click();
    const cards = page.getByTestId("submission-card");
    await expect(cards).toHaveCount(2); // r1, r2
    await expect(page.getByTestId("approve-btn")).toHaveCount(0);
    await expect(page.getByTestId("reject-btn")).toHaveCount(0);
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i)).toHaveAttribute("data-bucket", "rejected");
    }
  });

  test("All tab: buttons appear ONLY on pending-bucket cards", async ({ page }) => {
    await page.getByRole("tab", { name: "All" }).click();
    const cards = page.getByTestId("submission-card");
    await expect(cards).toHaveCount(7);
    const count = await cards.count();
    let pendingWithBtns = 0;
    let nonPendingWithBtns = 0;
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const bucket = await card.getAttribute("data-bucket");
      const approveCount = await card.getByTestId("approve-btn").count();
      const rejectCount = await card.getByTestId("reject-btn").count();
      if (bucket === "pending") {
        expect(approveCount, `pending card ${i} missing Approve`).toBe(1);
        expect(rejectCount, `pending card ${i} missing Reject`).toBe(1);
        pendingWithBtns++;
      } else {
        expect(approveCount, `non-pending bucket "${bucket}" leaked Approve`).toBe(0);
        expect(rejectCount, `non-pending bucket "${bucket}" leaked Reject`).toBe(0);
        nonPendingWithBtns++;
      }
    }
    expect(pendingWithBtns).toBe(3);
    expect(nonPendingWithBtns).toBe(4);
  });

  test("Unknown status falls into Pending bucket and shows action buttons", async ({ page }) => {
    await page.getByRole("tab", { name: "Pending" }).click();
    const carol = page.locator('[data-testid="submission-card"][data-id="p3"]');
    await expect(carol).toBeVisible();
    await expect(carol).toHaveAttribute("data-status", "future_unknown");
    await expect(carol.getByTestId("approve-btn")).toBeVisible();
    await expect(carol.getByTestId("reject-btn")).toBeVisible();
  });

  test("Switching tabs back to Pending re-renders buttons correctly", async ({ page }) => {
    await page.getByRole("tab", { name: "Approved" }).click();
    await expect(page.getByTestId("approve-btn")).toHaveCount(0);
    await page.getByRole("tab", { name: "Pending" }).click();
    await expect(page.getByTestId("approve-btn")).toHaveCount(3);
    await expect(page.getByTestId("reject-btn")).toHaveCount(3);
  });
});

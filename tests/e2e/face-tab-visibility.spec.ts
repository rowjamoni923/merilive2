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

  test("Approved tab: every card is approved-bucket and shows NO Approve/Reject buttons", async ({ page }) => {
    await page.getByRole("tab", { name: "Approved" }).click();
    const cards = page.getByTestId("submission-card");
    await expect(cards).toHaveCount(2); // a1 (approved), a2 (auto_approved)
    // Global guarantee: zero action buttons anywhere on the tab.
    await expect(page.getByTestId("approve-btn")).toHaveCount(0);
    await expect(page.getByTestId("reject-btn")).toHaveCount(0);
    // Per-row guarantee: each card must be approved-bucket, raw status must be
    // one of the approved set, the approved badge is the only visible badge,
    // and Approve/Reject are absent on THIS card (not just globally).
    const APPROVED_STATUSES = new Set([
      "approved", "auto_approved", "auto-approved", "auto_verified", "auto-verified",
    ]);
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute("data-bucket", "approved");
      const status = (await card.getAttribute("data-status")) ?? "";
      expect(APPROVED_STATUSES.has(status), `row ${i} has non-approved status "${status}"`).toBe(true);
      await expect(card.locator(".badge-approved")).toBeVisible();
      await expect(card.locator(".badge-pending")).toHaveCount(0);
      await expect(card.locator(".badge-rejected")).toHaveCount(0);
      expect(await card.getByTestId("approve-btn").count(), `Approve leaked on approved row ${i}`).toBe(0);
      expect(await card.getByTestId("reject-btn").count(), `Reject leaked on approved row ${i}`).toBe(0);
    }
  });

  test("Rejected tab: every card is rejected-bucket and shows NO Approve/Reject buttons", async ({ page }) => {
    await page.getByRole("tab", { name: "Rejected" }).click();
    const cards = page.getByTestId("submission-card");
    await expect(cards).toHaveCount(2); // r1 (rejected), r2 (auto_rejected)
    await expect(page.getByTestId("approve-btn")).toHaveCount(0);
    await expect(page.getByTestId("reject-btn")).toHaveCount(0);
    const REJECTED_STATUSES = new Set([
      "rejected", "auto_rejected", "auto-rejected",
    ]);
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute("data-bucket", "rejected");
      const status = (await card.getAttribute("data-status")) ?? "";
      expect(REJECTED_STATUSES.has(status), `row ${i} has non-rejected status "${status}"`).toBe(true);
      await expect(card.locator(".badge-rejected")).toBeVisible();
      await expect(card.locator(".badge-pending")).toHaveCount(0);
      await expect(card.locator(".badge-approved")).toHaveCount(0);
      expect(await card.getByTestId("approve-btn").count(), `Approve leaked on rejected row ${i}`).toBe(0);
      expect(await card.getByTestId("reject-btn").count(), `Reject leaked on rejected row ${i}`).toBe(0);
    }
  });

  test("Approved tab: pending and rejected rows are NOT rendered", async ({ page }) => {
    await page.getByRole("tab", { name: "Approved" }).click();
    // Cross-bucket leakage check by data-id from the fixture.
    for (const id of ["p1", "p2", "p3", "r1", "r2"]) {
      await expect(page.locator(`[data-testid="submission-card"][data-id="${id}"]`)).toHaveCount(0);
    }
    for (const id of ["a1", "a2"]) {
      await expect(page.locator(`[data-testid="submission-card"][data-id="${id}"]`)).toHaveCount(1);
    }
  });

  test("Rejected tab: pending and approved rows are NOT rendered", async ({ page }) => {
    await page.getByRole("tab", { name: "Rejected" }).click();
    for (const id of ["p1", "p2", "p3", "a1", "a2"]) {
      await expect(page.locator(`[data-testid="submission-card"][data-id="${id}"]`)).toHaveCount(0);
    }
    for (const id of ["r1", "r2"]) {
      await expect(page.locator(`[data-testid="submission-card"][data-id="${id}"]`)).toHaveCount(1);
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

test.describe("Face verification — edge cases (empty/malformed status)", () => {
  test("Pending tab with NO pending rows: empty state shown, ZERO action buttons", async ({ page }) => {
    await page.goto(`${HARNESS_URL}?fixture=empty_pending`);
    await page.getByRole("tab", { name: "Pending" }).click();
    await expect(page.getByTestId("submission-card")).toHaveCount(0);
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("approve-btn")).toHaveCount(0);
    await expect(page.getByTestId("reject-btn")).toHaveCount(0);
    // Approved/Rejected tabs should still render their respective rows.
    await page.getByRole("tab", { name: "Approved" }).click();
    await expect(page.getByTestId("submission-card")).toHaveCount(1);
    await expect(page.getByTestId("approve-btn")).toHaveCount(0);
    await page.getByRole("tab", { name: "Rejected" }).click();
    await expect(page.getByTestId("submission-card")).toHaveCount(1);
    await expect(page.getByTestId("reject-btn")).toHaveCount(0);
  });

  test("Fully empty dataset: every tab shows empty state with no buttons", async ({ page }) => {
    await page.goto(`${HARNESS_URL}?fixture=empty_all`);
    for (const tab of ["Pending", "Approved", "Rejected", "All"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByTestId("submission-card")).toHaveCount(0);
      await expect(page.getByTestId("empty-state")).toBeVisible();
      await expect(page.getByTestId("approve-btn")).toHaveCount(0);
      await expect(page.getByTestId("reject-btn")).toHaveCount(0);
    }
  });

  test("Malformed status flags fall into Pending and render correct buttons", async ({ page }) => {
    await page.goto(`${HARNESS_URL}?fixture=bad_status`);
    await page.getByRole("tab", { name: "Pending" }).click();
    // b1 (null), b2 (""), b3 ("   "), b5 (numeric), b6 (garbage) → pending bucket.
    // b4 ("APPROVED") normalizes via .toLowerCase() → approved bucket, must NOT show.
    const cards = page.getByTestId("submission-card");
    await expect(cards).toHaveCount(5);
    const ids = await cards.evaluateAll(els => els.map(e => e.getAttribute("data-id")));
    expect(ids.sort()).toEqual(["b1", "b2", "b3", "b5", "b6"]);
    expect(ids).not.toContain("b4");
    // Each malformed-status card MUST still expose Approve & Reject (admin must
    // be able to clear bad rows).
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await expect(card).toHaveAttribute("data-bucket", "pending");
      await expect(card.getByTestId("approve-btn")).toBeVisible();
      await expect(card.getByTestId("reject-btn")).toBeVisible();
    }
  });

  test("Mixed-case 'APPROVED' is normalized to Approved tab (no leak into Pending)", async ({ page }) => {
    await page.goto(`${HARNESS_URL}?fixture=bad_status`);
    await page.getByRole("tab", { name: "Approved" }).click();
    const cards = page.getByTestId("submission-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute("data-id", "b4");
    await expect(cards.first()).toHaveAttribute("data-bucket", "approved");
    // No action buttons on Approved tab even for malformed source status.
    await expect(page.getByTestId("approve-btn")).toHaveCount(0);
    await expect(page.getByTestId("reject-btn")).toHaveCount(0);
  });

  test("Rejected tab with malformed dataset is empty (no false rejected rows)", async ({ page }) => {
    await page.goto(`${HARNESS_URL}?fixture=bad_status`);
    await page.getByRole("tab", { name: "Rejected" }).click();
    await expect(page.getByTestId("submission-card")).toHaveCount(0);
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("reject-btn")).toHaveCount(0);
  });
});

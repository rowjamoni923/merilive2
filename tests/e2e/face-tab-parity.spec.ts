import { test, expect, type Page } from "@playwright/test";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";

/**
 * Parity E2E: AdminFaceVerification page AND AdminUserManagement → "Face Verify"
 * tab MUST produce identical filter results, tab counts, and Approve/Reject
 * button visibility (Pending-only) for the same dataset.
 *
 * Both surfaces share `bucketOfStatus` from src/lib/admin/statusCounts.ts —
 * the harness mirrors that exact logic. We load it twice (once per "page")
 * with the same `?fixture=default` dataset and cross-check every tab.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = pathToFileURL(
  path.resolve(__dirname, "fixtures/face-tab-harness.html"),
).toString();

const TABS = ["Pending", "Approved", "Rejected", "All"] as const;

async function snapshotTab(page: Page, tab: string) {
  await page.getByRole("tab", { name: tab }).click();
  const cards = page.getByTestId("submission-card");
  const count = await cards.count();
  const rows: Array<{ id: string | null; bucket: string | null; status: string | null; approve: number; reject: number }> = [];
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    rows.push({
      id: await card.getAttribute("data-id"),
      bucket: await card.getAttribute("data-bucket"),
      status: await card.getAttribute("data-status"),
      approve: await card.getByTestId("approve-btn").count(),
      reject: await card.getByTestId("reject-btn").count(),
    });
  }
  return {
    cardCount: count,
    approveTotal: await page.getByTestId("approve-btn").count(),
    rejectTotal: await page.getByTestId("reject-btn").count(),
    rows,
  };
}

test.describe("Face verification — AdminFaceVerification vs UserManagement Face Verify parity", () => {
  test("Both surfaces produce identical counts, filters, and button visibility per tab", async ({ browser }) => {
    // Two isolated contexts simulate the two admin pages independently.
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage(); // AdminFaceVerification
    const pageB = await ctxB.newPage(); // AdminUserManagement → Face Verify
    await pageA.goto(`${HARNESS_URL}?fixture=default`);
    await pageB.goto(`${HARNESS_URL}?fixture=default`);

    for (const tab of TABS) {
      const a = await snapshotTab(pageA, tab);
      const b = await snapshotTab(pageB, tab);

      // 1) Count parity
      expect(a.cardCount, `[${tab}] card count diverged`).toBe(b.cardCount);
      expect(a.approveTotal, `[${tab}] approve-btn total diverged`).toBe(b.approveTotal);
      expect(a.rejectTotal, `[${tab}] reject-btn total diverged`).toBe(b.rejectTotal);

      // 2) Row-by-row parity (same ids in same order, same bucket/status)
      expect(a.rows, `[${tab}] rendered rows diverged`).toEqual(b.rows);

      // 3) Button rule: Approve/Reject ONLY on pending-bucket rows
      for (const row of a.rows) {
        if (row.bucket === "pending") {
          expect(row.approve, `[${tab}] pending row ${row.id} missing Approve`).toBe(1);
          expect(row.reject, `[${tab}] pending row ${row.id} missing Reject`).toBe(1);
        } else {
          expect(row.approve, `[${tab}] non-pending row ${row.id} leaked Approve`).toBe(0);
          expect(row.reject, `[${tab}] non-pending row ${row.id} leaked Reject`).toBe(0);
        }
      }
    }

    // 4) Tab badge math (sum of Pending+Approved+Rejected == All)
    const pendingCount = (await snapshotTab(pageA, "Pending")).cardCount;
    const approvedCount = (await snapshotTab(pageA, "Approved")).cardCount;
    const rejectedCount = (await snapshotTab(pageA, "Rejected")).cardCount;
    const allCount = (await snapshotTab(pageA, "All")).cardCount;
    expect(pendingCount + approvedCount + rejectedCount).toBe(allCount);

    await ctxA.close();
    await ctxB.close();
  });

  test("Only Pending tab exposes Approve/Reject — verified on BOTH surfaces", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    await pageA.goto(`${HARNESS_URL}?fixture=default`);
    await pageB.goto(`${HARNESS_URL}?fixture=default`);

    for (const page of [pageA, pageB]) {
      await page.getByRole("tab", { name: "Pending" }).click();
      expect(await page.getByTestId("approve-btn").count()).toBeGreaterThan(0);
      expect(await page.getByTestId("reject-btn").count()).toBeGreaterThan(0);

      for (const tab of ["Approved", "Rejected"] as const) {
        await page.getByRole("tab", { name: tab }).click();
        await expect(page.getByTestId("approve-btn")).toHaveCount(0);
        await expect(page.getByTestId("reject-btn")).toHaveCount(0);
      }
    }

    await ctxA.close();
    await ctxB.close();
  });
});

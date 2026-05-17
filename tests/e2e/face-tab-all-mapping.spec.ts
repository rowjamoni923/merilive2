import { test, expect } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HARNESS = pathToFileURL(
  path.resolve(__dirname, "fixtures/face-tab-harness.html"),
).toString();

type Row = {
  id: string;
  bucket: "pending" | "approved" | "rejected";
  status: string;
  approve: number;
  reject: number;
};

async function gotoAll(page: import("@playwright/test").Page, fixture: string) {
  await page.goto(`${HARNESS}?fixture=${fixture}`);
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByRole("tab", { name: "All" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

async function snapshotAll(page: import("@playwright/test").Page): Promise<Row[]> {
  return page.$$eval('[data-testid="submission-card"]', (cards) =>
    cards.map((c) => ({
      id: c.getAttribute("data-id") || "",
      bucket: (c.getAttribute("data-bucket") || "") as Row["bucket"],
      status: c.getAttribute("data-status") || "",
      approve: c.querySelectorAll('[data-testid="approve-btn"]').length,
      reject: c.querySelectorAll('[data-testid="reject-btn"]').length,
    })),
  );
}

// Expected complete mapping for the `default` fixture, ordered as fixture
// declares them. Pending-bucket rows must show exactly one Approve and one
// Reject button; approved/rejected rows must show none.
const EXPECTED_DEFAULT: Row[] = [
  { id: "p1", bucket: "pending",  status: "pending",         approve: 1, reject: 1 },
  { id: "p2", bucket: "pending",  status: "submitted",       approve: 1, reject: 1 },
  { id: "p3", bucket: "pending",  status: "future_unknown",  approve: 1, reject: 1 },
  { id: "a1", bucket: "approved", status: "approved",        approve: 0, reject: 0 },
  { id: "a2", bucket: "approved", status: "auto_approved",   approve: 0, reject: 0 },
  { id: "r1", bucket: "rejected", status: "rejected",        approve: 0, reject: 0 },
  { id: "r2", bucket: "rejected", status: "auto_rejected",   approve: 0, reject: 0 },
];

// `bad_status` fixture: malformed flags fall to pending (with buttons) except
// mixed-case "APPROVED" which normalizes to approved (no buttons).
const EXPECTED_BAD: Row[] = [
  { id: "b1", bucket: "pending",  status: "",            approve: 1, reject: 1 },
  { id: "b2", bucket: "pending",  status: "",            approve: 1, reject: 1 },
  { id: "b3", bucket: "pending",  status: "   ",         approve: 1, reject: 1 },
  { id: "b4", bucket: "approved", status: "APPROVED",    approve: 0, reject: 0 },
  { id: "b5", bucket: "pending",  status: "42",          approve: 1, reject: 1 },
  { id: "b6", bucket: "pending",  status: "wat_is_this", approve: 1, reject: 1 },
];

test.describe("All tab — full per-card Approve/Reject button mapping", () => {
  test("default fixture: every row maps exactly per data-bucket", async ({ page }) => {
    await gotoAll(page, "default");
    const rows = await snapshotAll(page);
    expect(rows).toEqual(EXPECTED_DEFAULT);

    // Invariant guard: button counts must be a strict function of bucket.
    for (const r of rows) {
      if (r.bucket === "pending") {
        expect(r.approve, `approve on ${r.id}`).toBe(1);
        expect(r.reject, `reject on ${r.id}`).toBe(1);
      } else {
        expect(r.approve, `approve on ${r.id}`).toBe(0);
        expect(r.reject, `reject on ${r.id}`).toBe(0);
      }
    }

    // Totals match bucket counts.
    const pendCount = rows.filter((r) => r.bucket === "pending").length;
    const approveTotal = await page
      .locator('[data-testid="approve-btn"]')
      .count();
    const rejectTotal = await page
      .locator('[data-testid="reject-btn"]')
      .count();
    expect(approveTotal).toBe(pendCount);
    expect(rejectTotal).toBe(pendCount);
  });

  test("bad_status fixture: malformed statuses map correctly", async ({ page }) => {
    await gotoAll(page, "bad_status");
    const rows = await snapshotAll(page);
    expect(rows).toEqual(EXPECTED_BAD);
  });

  test("empty_pending fixture: All tab shows no Approve/Reject buttons", async ({
    page,
  }) => {
    await gotoAll(page, "empty_pending");
    const rows = await snapshotAll(page);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.bucket !== "pending")).toBe(true);
    expect(await page.locator('[data-testid="approve-btn"]').count()).toBe(0);
    expect(await page.locator('[data-testid="reject-btn"]').count()).toBe(0);
  });

  test("empty_all fixture: All tab renders empty state, zero buttons", async ({
    page,
  }) => {
    await gotoAll(page, "empty_all");
    await expect(page.getByTestId("empty-state")).toBeVisible();
    expect(await page.locator('[data-testid="submission-card"]').count()).toBe(0);
    expect(await page.locator('[data-testid="approve-btn"]').count()).toBe(0);
    expect(await page.locator('[data-testid="reject-btn"]').count()).toBe(0);
  });
});

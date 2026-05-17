import { test, expect, type Page } from "@playwright/test";
import { injectAdminSession } from "./helpers/adminSession";
import { FACE_E2E_TAG, EXPECTED } from "./fixtures/seed";

/**
 * Real-page parity: badge counts on Pending/Approved/Rejected/All MUST equal
 * the visible `submission-card` count after scoping the page search input to
 * our seeded `e2e-face-test-*` rows.
 *
 * Skipped when E2E_ADMIN_TOKEN / E2E_ADMIN_ACCESS_TOKEN / SUPABASE_SERVICE_ROLE_KEY
 * are missing — the project-level config simply registers no projects in that case.
 */

type Tab = "pending" | "approved" | "rejected" | "all";
const TABS: Tab[] = ["pending", "approved", "rejected", "all"];

async function readBadge(page: Page, tab: Tab): Promise<number> {
  const txt = (await page.getByTestId(`tab-count-${tab}`).textContent()) ?? "0";
  return Number(txt.trim() || "0");
}

async function selectTab(page: Page, tab: Tab): Promise<void> {
  await page.getByTestId(`tab-${tab}`).click();
  await expect(page.getByTestId(`tab-${tab}`)).toHaveAttribute(
    "data-state",
    "active",
  );
}

async function visibleCards(page: Page): Promise<number> {
  return page.locator('[data-testid="submission-card"]').count();
}

test.describe("/admin/face-verification — real badge ↔ card parity", () => {
  test.beforeEach(async ({ context, page }) => {
    await injectAdminSession(context);
    await page.goto("/admin/face-verification");
    // Wait for either at least one card OR the empty-state placeholder.
    await page.waitForSelector(
      '[data-testid="submission-card"], [data-testid="empty-state"]',
      { timeout: 30_000 },
    );
    // Scope the visible pool to our seeded rows via the search input.
    await page
      .getByPlaceholder("Search by name or UID...")
      .fill(FACE_E2E_TAG);
    // Search filter is purely client-side, so the badge counts update synchronously.
    await expect(page.getByTestId("tab-count-all")).toHaveText(
      String(EXPECTED.all),
      { timeout: 5_000 },
    );
  });

  test("badge counts match visible cards on every tab", async ({ page }) => {
    const badges: Record<Tab, number> = {
      pending: await readBadge(page, "pending"),
      approved: await readBadge(page, "approved"),
      rejected: await readBadge(page, "rejected"),
      all: await readBadge(page, "all"),
    };

    expect(badges).toEqual(EXPECTED);
    expect(badges.pending + badges.approved + badges.rejected).toBe(badges.all);

    for (const tab of TABS) {
      await selectTab(page, tab);
      // Allow a tick for TabsContent to swap.
      await page.waitForTimeout(150);
      const cards = await visibleCards(page);
      expect(cards, `card count on ${tab} tab`).toBe(badges[tab]);
      if (cards === 0) {
        await expect(page.getByTestId("empty-state")).toBeVisible();
      }
    }
  });
});

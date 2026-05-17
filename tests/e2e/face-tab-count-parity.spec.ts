import { test, expect } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const HARNESS = pathToFileURL(
  path.resolve(__dirname, "fixtures/face-tab-harness.html"),
).toString();

type Tab = "pending" | "approved" | "rejected" | "all";
const TABS: Tab[] = ["pending", "approved", "rejected", "all"];

const TAB_LABEL: Record<Tab, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  all: "All",
};

async function readBadge(page: import("@playwright/test").Page, tab: Tab) {
  const txt = await page.getByTestId(`tab-count-${tab}`).textContent();
  return Number((txt ?? "").trim());
}

async function selectTab(page: import("@playwright/test").Page, tab: Tab) {
  await page.getByRole("tab", { name: TAB_LABEL[tab], exact: false }).click();
  await expect(
    page.getByRole("tab", { name: TAB_LABEL[tab], exact: false }),
  ).toHaveAttribute("aria-selected", "true");
}

async function visibleCardCount(page: import("@playwright/test").Page) {
  return page.locator('[data-testid="submission-card"]').count();
}

test.describe("Tab badge counts ↔ visible card count parity", () => {
  for (const fixture of ["default", "bad_status", "empty_pending", "empty_all"]) {
    test(`fixture "${fixture}": every tab's badge equals rendered card count`, async ({
      page,
    }) => {
      await page.goto(`${HARNESS}?fixture=${fixture}`);

      // Snapshot all four badge counts up-front (badges are tab-independent).
      const badges: Record<Tab, number> = {
        pending: await readBadge(page, "pending"),
        approved: await readBadge(page, "approved"),
        rejected: await readBadge(page, "rejected"),
        all: await readBadge(page, "all"),
      };

      // Pending + Approved + Rejected must equal All.
      expect(badges.pending + badges.approved + badges.rejected).toBe(badges.all);

      // For each tab, switch and verify card count matches badge.
      for (const tab of TABS) {
        await selectTab(page, tab);
        const cards = await visibleCardCount(page);
        expect(cards, `card count on ${tab} tab`).toBe(badges[tab]);
        if (cards === 0) {
          await expect(page.getByTestId("empty-state")).toBeVisible();
        }
      }
    });
  }

  test("default fixture: badges stay in sync after Approve/Reject actions", async ({
    page,
  }) => {
    await page.goto(`${HARNESS}?fixture=default`);

    // Initial: 3 pending, 2 approved, 2 rejected, 7 all.
    expect(await readBadge(page, "pending")).toBe(3);
    expect(await readBadge(page, "approved")).toBe(2);
    expect(await readBadge(page, "rejected")).toBe(2);
    expect(await readBadge(page, "all")).toBe(7);

    // Approve p1 from Pending.
    await selectTab(page, "pending");
    await page.locator('[data-testid="approve-btn"][data-id="p1"]').click();

    // Reject p2 from Pending (still showing remaining pending rows).
    await page.locator('[data-testid="reject-btn"][data-id="p2"]').click();

    // Counts must reflect 1 pending, 3 approved, 3 rejected, 7 all.
    expect(await readBadge(page, "pending")).toBe(1);
    expect(await readBadge(page, "approved")).toBe(3);
    expect(await readBadge(page, "rejected")).toBe(3);
    expect(await readBadge(page, "all")).toBe(7);

    // Visible cards on each tab match the new badges.
    for (const tab of TABS) {
      await selectTab(page, tab);
      const cards = await visibleCardCount(page);
      expect(cards, `card count on ${tab} after actions`).toBe(
        await readBadge(page, tab),
      );
    }
  });
});

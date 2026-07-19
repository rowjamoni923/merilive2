import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// ---- Mocks ----------------------------------------------------------------
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/utils/taskDateUtils", () => ({
  // Pin the "today" so the date-range filter is deterministic.
  getTaskDate: () => "2026-05-18",
}));

vi.mock("@/components/common/BeansIcon", () => ({
  default: () => <span data-testid="beans-icon" />,
}));

import HostBonusLedger from "@/pages/HostBonusLedger";

// Server-shaped fixture: mirrors get_my_host_bonus_ledger() exactly.
// - Day 1 (today, 2026-05-18): 6 rows recorded for a 5-hour cap → cap_exceeded
//     * Hours 1..5 completed; H1..H4 claimed (4 × 1000 beans = 4000 beans)
//     * Hour 6 is the over-cap row that must surface a red badge + tooltip
// - Day 2 (yesterday, 2026-05-17): 3 rows, within cap, 2 claimed = 1500 beans
const ledgerFixture = {
  success: true,
  max_hours_per_day: 5,
  totals: {
    total_beans: 4000 + 1500,
    total_claimed_hours: 4 + 2,
    total_completed_hours: 5 + 2,
  },
  days: [
    {
      program_day: 2,
      task_date: "2026-05-18",
      rows_recorded: 6,
      completed_hours: 5,
      day_beans: 4000,
      cap_exceeded: true,
      hours: [
        { hour_number: 1, target_minutes: 60, minutes_accumulated: 60, completed: true, claimed: true, claimed_beans: 1000, bonus_amount: 1000, claimed_at: "2026-05-18T10:01:00Z", last_minute_at: "2026-05-18T10:00:00Z" },
        { hour_number: 2, target_minutes: 60, minutes_accumulated: 60, completed: true, claimed: true, claimed_beans: 1000, bonus_amount: 1000, claimed_at: "2026-05-18T11:01:00Z", last_minute_at: "2026-05-18T11:00:00Z" },
        { hour_number: 3, target_minutes: 60, minutes_accumulated: 60, completed: true, claimed: true, claimed_beans: 1000, bonus_amount: 1000, claimed_at: "2026-05-18T12:01:00Z", last_minute_at: "2026-05-18T12:00:00Z" },
        { hour_number: 4, target_minutes: 60, minutes_accumulated: 60, completed: true, claimed: true, claimed_beans: 1000, bonus_amount: 1000, claimed_at: "2026-05-18T13:01:00Z", last_minute_at: "2026-05-18T13:00:00Z" },
        { hour_number: 5, target_minutes: 60, minutes_accumulated: 60, completed: true, claimed: false, claimed_beans: 0, bonus_amount: 1000, claimed_at: null, last_minute_at: "2026-05-18T14:00:00Z" },
        { hour_number: 6, target_minutes: 60, minutes_accumulated: 45, completed: false, claimed: false, claimed_beans: 0, bonus_amount: 0, claimed_at: null, last_minute_at: "2026-05-18T15:30:00Z" },
      ],
    },
    {
      program_day: 1,
      task_date: "2026-05-17",
      rows_recorded: 3,
      completed_hours: 2,
      day_beans: 1500,
      cap_exceeded: false,
      hours: [
        { hour_number: 1, target_minutes: 60, minutes_accumulated: 60, completed: true, claimed: true, claimed_beans: 750, bonus_amount: 750, claimed_at: "2026-05-17T10:01:00Z", last_minute_at: "2026-05-17T10:00:00Z" },
        { hour_number: 2, target_minutes: 60, minutes_accumulated: 60, completed: true, claimed: true, claimed_beans: 750, bonus_amount: 750, claimed_at: "2026-05-17T11:01:00Z", last_minute_at: "2026-05-17T11:00:00Z" },
        { hour_number: 3, target_minutes: 60, minutes_accumulated: 20, completed: false, claimed: false, claimed_beans: 0, bonus_amount: 0, claimed_at: null, last_minute_at: "2026-05-17T12:00:00Z" },
      ],
    },
  ],
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <HostBonusLedger />
    </MemoryRouter>,
  );

beforeEach(() => {
  rpcMock.mockReset();
});
afterEach(() => cleanup());

describe("HostBonusLedger end-to-end render", () => {
  it("calls the server ledger RPC with the documented limit", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ...ledgerFixture, days: [], totals: { total_beans: 0, total_claimed_hours: 0, total_completed_hours: 0 } }, error: null });
    renderPage();
    await screen.findByText(/Cap \/ Day/i);
    expect(rpcMock).toHaveBeenCalledWith("get_my_host_bonus_ledger", { _limit_days: 30 });
  });

  it("renders top-line totals straight from server totals (no client recompute)", async () => {
    rpcMock.mockResolvedValueOnce({ data: ledgerFixture, error: null });
    renderPage();
    await screen.findByText("Total Beans");
    // "5,500" shows in both the top stat and the range summary — assert both.
    expect(screen.getAllByText("5,500").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("5 hr")).toBeInTheDocument(); // max_hours_per_day
  });

  it("flags the cap-exceeded day with a banner + OVER badge for the 6th row", async () => {
    rpcMock.mockResolvedValueOnce({ data: ledgerFixture, error: null });
    renderPage();
    const banner = await screen.findByText(/Cap exceeded — 6 rows vs 5-hour cap\./i);
    expect(banner).toBeInTheDocument();

    // Exactly one row (the 6th) is over the 5-hour cap → one OVER badge,
    // labelled "Cap exceeded — why?" for screen readers.
    const overBadges = screen.getAllByRole("button", { name: /Cap exceeded — why\?/i });
    expect(overBadges).toHaveLength(1);

    // The capped row also shows the "capped" payout label instead of "—".
    expect(screen.getByText("capped")).toBeInTheDocument();
  });

  it("renders claimed beans per hour exactly as returned by the server", async () => {
    rpcMock.mockResolvedValueOnce({ data: ledgerFixture, error: null });
    renderPage();
    await screen.findByText("Total Beans");
    // Day 2 (today): 4 claimed hours at 1000 beans each.
    expect(screen.getAllByText("+1,000")).toHaveLength(4);
    // Day 1 (yesterday): 2 claimed hours at 750 beans each.
    expect(screen.getAllByText("+750")).toHaveLength(2);
    // Day 2 completed-but-unclaimed H5 surfaces as "unclaimed".
    expect(screen.getByText("unclaimed")).toBeInTheDocument();
  });

  it("Last 7 days summary aggregates beans + flags cap break", async () => {
    rpcMock.mockResolvedValueOnce({ data: ledgerFixture, error: null });
    renderPage();
    // Default range is "last7" — both fixture days fall within it.
    const summary = await screen.findByText(/Last 7 days summary/i);
    const section = summary.closest("section")!;
    expect(within(section).getByText("2 days")).toBeInTheDocument();
    // recorded rows vs cap: 6+3 = 9 / (5 * 2) = 10
    expect(within(section).getByText("9 / 10")).toBeInTheDocument();
    // earned beans 5,500
    expect(within(section).getByText("5,500")).toBeInTheDocument();
    // Cap-broken banner in the summary.
    expect(
      within(section).getByText(/1 day exceeded the 5-hour cap.*2026-05-18/i),
    ).toBeInTheDocument();
  });

  it("surfaces RPC errors to the host instead of crashing", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    renderPage();
    expect(await screen.findByText("boom")).toBeInTheDocument();
  });
});

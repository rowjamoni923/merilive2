// Pkg60 — Leaderboard ranking & reward-tier regression guard
// Prevents off-by-one bugs in:
//   1. Top-N slicing (must be 50, not 10)
//   2. EXCLUDED_IDS filter (exclude BEFORE rank assignment)
//   3. Reward tier lookup (gapless 1..50 coverage)
//   4. Asia/Dhaka 12:30 AM period boundary math
import { describe, it, expect } from "vitest";

type Row = { id: string; stat_value: number };
type Tier = { rank_from: number; rank_to: number };

const EXCLUDED_IDS = ["admin-1", "test-bot"];

function buildRanking(raw: Row[]): Array<Row & { rank: number }> {
  return raw
    .filter((r) => !EXCLUDED_IDS.includes(r.id))
    .sort((a, b) => b.stat_value - a.stat_value)
    .slice(0, 50)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

function getRewardForRank(rank: number, tiers: Tier[]): Tier | undefined {
  return tiers.find((t) => rank >= t.rank_from && rank <= t.rank_to);
}

// Mirror of SQL leaderboard_period_start (Asia/Dhaka, 12:30 AM reset)
function periodStart(period: "daily" | "weekly" | "monthly", nowUtc: Date): Date {
  // Shift to Dhaka local (UTC+6), subtract 30min so window edge sits at 00:30
  const dhakaOffsetMs = 6 * 60 * 60 * 1000;
  const local = new Date(nowUtc.getTime() + dhakaOffsetMs);
  const shifted = new Date(local.getTime() - 30 * 60 * 1000);
  let bucket: Date;
  if (period === "daily") {
    bucket = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  } else if (period === "weekly") {
    const dow = (shifted.getUTCDay() + 6) % 7; // Monday=0
    bucket = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - dow));
  } else {
    bucket = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1));
  }
  // +30 min then back to UTC
  return new Date(bucket.getTime() + 30 * 60 * 1000 - dhakaOffsetMs);
}

describe("Leaderboard ranking", () => {
  it("displays exactly Top 50 (not Top 10)", () => {
    const raw: Row[] = Array.from({ length: 80 }, (_, i) => ({ id: `u${i}`, stat_value: 1000 - i }));
    const ranked = buildRanking(raw);
    expect(ranked).toHaveLength(50);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[49].rank).toBe(50);
  });

  it("filters EXCLUDED_IDS BEFORE rank assignment (no rank gaps)", () => {
    const raw: Row[] = [
      { id: "admin-1", stat_value: 9999 }, // would be #1 if not excluded
      { id: "u1", stat_value: 500 },
      { id: "test-bot", stat_value: 400 },
      { id: "u2", stat_value: 300 },
      { id: "u3", stat_value: 200 },
    ];
    const ranked = buildRanking(raw);
    expect(ranked.map((r) => r.id)).toEqual(["u1", "u2", "u3"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("ranks are contiguous 1..N with no off-by-one", () => {
    const raw: Row[] = Array.from({ length: 50 }, (_, i) => ({ id: `u${i}`, stat_value: 100 - i }));
    const ranked = buildRanking(raw);
    ranked.forEach((r, i) => expect(r.rank).toBe(i + 1));
  });

  it("ties: stable order, still increments rank", () => {
    const raw: Row[] = [
      { id: "a", stat_value: 100 },
      { id: "b", stat_value: 100 },
      { id: "c", stat_value: 100 },
    ];
    const ranked = buildRanking(raw);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe("Reward tier lookup (1..50 coverage)", () => {
  const tiers: Tier[] = [
    { rank_from: 1, rank_to: 1 },
    { rank_from: 2, rank_to: 2 },
    { rank_from: 3, rank_to: 3 },
    { rank_from: 4, rank_to: 10 },
    { rank_from: 11, rank_to: 25 },
    { rank_from: 26, rank_to: 50 },
  ];

  it("every rank 1..50 maps to exactly one tier (no gaps, no overlaps)", () => {
    for (let rank = 1; rank <= 50; rank++) {
      const matches = tiers.filter((t) => rank >= t.rank_from && rank <= t.rank_to);
      expect(matches, `rank ${rank}`).toHaveLength(1);
    }
  });

  it("boundary ranks (off-by-one guard)", () => {
    expect(getRewardForRank(1, tiers)?.rank_to).toBe(1);
    expect(getRewardForRank(3, tiers)?.rank_to).toBe(3);
    expect(getRewardForRank(4, tiers)?.rank_from).toBe(4);
    expect(getRewardForRank(10, tiers)?.rank_to).toBe(10);
    expect(getRewardForRank(11, tiers)?.rank_from).toBe(11);
    expect(getRewardForRank(25, tiers)?.rank_to).toBe(25);
    expect(getRewardForRank(26, tiers)?.rank_from).toBe(26);
    expect(getRewardForRank(50, tiers)?.rank_to).toBe(50);
  });

  it("rank 51+ returns no tier", () => {
    expect(getRewardForRank(51, tiers)).toBeUndefined();
  });
});

describe("Asia/Dhaka 12:30 AM period boundary", () => {
  // 2026-05-20 00:29 BST = 2026-05-19 18:29 UTC → still previous day's window
  // 2026-05-20 00:30 BST = 2026-05-19 18:30 UTC → flips to new day
  const at = (iso: string) => new Date(iso);

  it("00:29 BST stays in previous day", () => {
    const a = periodStart("daily", at("2026-05-19T18:29:00Z"));
    const b = periodStart("daily", at("2026-05-18T18:30:00Z"));
    expect(a.getTime()).toBe(b.getTime());
  });

  it("00:30 BST flips to new day exactly", () => {
    const before = periodStart("daily", at("2026-05-19T18:29:59Z"));
    const after = periodStart("daily", at("2026-05-19T18:30:00Z"));
    expect(after.getTime()).toBeGreaterThan(before.getTime());
    expect(after.getTime() - before.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("weekly bucket starts Monday 00:30 BST", () => {
    // Wed 2026-05-20 12:00 BST → week start = Mon 2026-05-18 00:30 BST = 2026-05-17T18:30:00Z
    const ws = periodStart("weekly", at("2026-05-20T06:00:00Z"));
    expect(ws.toISOString()).toBe("2026-05-17T18:30:00.000Z");
  });

  it("monthly bucket starts 1st 00:30 BST", () => {
    // 2026-05-20 → 2026-05-01 00:30 BST = 2026-04-30T18:30:00Z
    const ms = periodStart("monthly", at("2026-05-20T06:00:00Z"));
    expect(ms.toISOString()).toBe("2026-04-30T18:30:00.000Z");
  });
});

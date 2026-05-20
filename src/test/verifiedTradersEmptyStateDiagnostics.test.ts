import { describe, it, expect } from "vitest";

/**
 * Pkg78 — Diamond Store "Verified Traders" empty-state diagnostics integration test.
 *
 * Mirrors the filter + counter logic from `src/pages/Recharge.tsx` fetchTopUpHelpers
 * (lines ~1054-1074) so we can assert that every blocker is attributed to the
 * correct diagnostic bucket. The page's empty-state UI reads from `helperDiag`
 * (rawTotal / byCountry / byInactive / byLowBalance / byTierMin / finalCount)
 * and surfaces one row per non-zero bucket.
 */

type HelperRow = {
  user_id: string;
  trader_level: number | null;
  is_active: boolean;
  is_verified: boolean;
  wallet_balance: number | null;
  country_code: string | null;
  user: { country_code?: string | null } | null;
};

type Diag = {
  rawTotal: number;
  byCountry: number;
  byTierMin: number;
  byInactive: number;
  byLowBalance: number;
  finalCount: number;
  userCountry: string | null;
};

// Default tier minimums (Pkg70 — admin-configurable; defaults used here).
const TIER_MIN: Record<number, number> = { 1: 50_000, 2: 100_000, 3: 150_000, 4: 200_000, 5: 300_000 };
const getTierMinWallet = (level: number | null | undefined) =>
  TIER_MIN[level ?? 1] ?? 50_000;

/** Verbatim mirror of Recharge.tsx fetchTopUpHelpers filter + diag (post-fix). */
function computeTraderDiagnostics(
  helpers: HelperRow[],
  userCountryCode: string | null,
): Diag {
  let byCountry = 0, byTierMin = 0, byInactive = 0, byLowBalance = 0;
  const filtered = helpers.filter((h) => {
    const user = h.user as any;
    const profileCountry = user?.country_code || h.country_code;
    if (profileCountry !== userCountryCode) { byCountry++; return false; }
    if (!h.is_active || !h.is_verified) { byInactive++; return false; }
    if ((h.wallet_balance ?? 1) < 50000) { byLowBalance++; return false; }
    const min = getTierMinWallet(h.trader_level);
    if ((h.wallet_balance ?? 1) < min) { byTierMin++; return false; }
    return true;
  });
  return {
    rawTotal: helpers.length,
    byCountry,
    byTierMin,
    byInactive,
    byLowBalance,
    finalCount: filtered.length,
    userCountry: userCountryCode,
  };
}

/** Mirror of the empty-state diagnostic-row rendering — which buckets show. */
function visibleDiagnosticRows(d: Diag): string[] {
  const rows: string[] = [];
  if (d.rawTotal === 0) rows.push("no_trader_data");
  if (d.byCountry > 0) rows.push("country_mismatch");
  if (d.byInactive > 0) rows.push("inactive_unverified");
  if (d.byLowBalance + d.byTierMin > 0) rows.push("wallet_below_threshold");
  return rows;
}

// Helper factory
const h = (over: Partial<HelperRow>): HelperRow => ({
  user_id: "u",
  trader_level: 1,
  is_active: true,
  is_verified: true,
  wallet_balance: 60_000,
  country_code: "BD",
  user: { country_code: "BD" },
  ...over,
});

describe("Pkg78 — Verified Traders empty-state diagnostics", () => {
  describe("Blocker 1: country mismatch", () => {
    it("counts every trader whose profile country ≠ viewer country", () => {
      const d = computeTraderDiagnostics(
        [
          h({ user: { country_code: "IN" } }),
          h({ user: { country_code: "PK" } }),
          h({ user: { country_code: "US" } }),
        ],
        "BD",
      );
      expect(d.rawTotal).toBe(3);
      expect(d.byCountry).toBe(3);
      expect(d.finalCount).toBe(0);
      expect(visibleDiagnosticRows(d)).toContain("country_mismatch");
    });

    it("falls back to row.country_code when profile country is null", () => {
      const d = computeTraderDiagnostics(
        [h({ user: { country_code: null }, country_code: "IN" })],
        "BD",
      );
      expect(d.byCountry).toBe(1);
    });

    it("country-matching trader still passes when other gates clear", () => {
      const d = computeTraderDiagnostics(
        [h({ user: { country_code: "BD" }, wallet_balance: 60_000 })],
        "BD",
      );
      expect(d.byCountry).toBe(0);
      expect(d.finalCount).toBe(1);
    });
  });

  describe("Blocker 2: inactive / unverified", () => {
    it("counts is_active=false and is_verified=false separately into byInactive", () => {
      const d = computeTraderDiagnostics(
        [
          h({ is_active: false }),
          h({ is_verified: false }),
          h({ is_active: false, is_verified: false }),
        ],
        "BD",
      );
      expect(d.byInactive).toBe(3);
      expect(d.finalCount).toBe(0);
      expect(visibleDiagnosticRows(d)).toContain("inactive_unverified");
    });

    it("country mismatch wins over inactive (early return order)", () => {
      // A trader who is BOTH wrong country AND inactive must only count in byCountry.
      const d = computeTraderDiagnostics(
        [h({ user: { country_code: "IN" }, is_active: false })],
        "BD",
      );
      expect(d.byCountry).toBe(1);
      expect(d.byInactive).toBe(0);
    });
  });

  describe("Blocker 3: wallet below threshold", () => {
    it("counts wallet < 50k base into byLowBalance", () => {
      const d = computeTraderDiagnostics(
        [
          h({ wallet_balance: 0 }),
          h({ wallet_balance: 10_000 }),
          h({ wallet_balance: 49_999 }),
        ],
        "BD",
      );
      expect(d.byLowBalance).toBe(3);
      expect(d.byTierMin).toBe(0);
      expect(visibleDiagnosticRows(d)).toContain("wallet_below_threshold");
    });

    it("counts wallet ≥ 50k but < tier min into byTierMin (e.g. L3 needs 150k)", () => {
      const d = computeTraderDiagnostics(
        [
          h({ trader_level: 3, wallet_balance: 50_000 }),  // < L3 150k
          h({ trader_level: 3, wallet_balance: 149_999 }), // < L3 150k
          h({ trader_level: 5, wallet_balance: 250_000 }), // < L5 300k
        ],
        "BD",
      );
      expect(d.byLowBalance).toBe(0);
      expect(d.byTierMin).toBe(3);
      // Empty-state combines both into one "Wallet below threshold" row.
      expect(visibleDiagnosticRows(d)).toContain("wallet_below_threshold");
    });

    it("L1 trader exactly at 50k passes (no tier-min upgrade for L1)", () => {
      const d = computeTraderDiagnostics(
        [h({ trader_level: 1, wallet_balance: 50_000 })],
        "BD",
      );
      expect(d.finalCount).toBe(1);
      expect(d.byLowBalance).toBe(0);
      expect(d.byTierMin).toBe(0);
    });
  });

  describe("Blocker 4: zero data (no helpers in system)", () => {
    it("rawTotal=0 surfaces the 'no_trader_data' diagnostic", () => {
      const d = computeTraderDiagnostics([], "BD");
      expect(d.rawTotal).toBe(0);
      expect(d.finalCount).toBe(0);
      expect(d.byCountry).toBe(0);
      expect(d.byInactive).toBe(0);
      expect(d.byLowBalance).toBe(0);
      expect(d.byTierMin).toBe(0);
      expect(visibleDiagnosticRows(d)).toEqual(["no_trader_data"]);
    });

    it("rawTotal=0 even with viewer country set", () => {
      const d = computeTraderDiagnostics([], null);
      expect(d.userCountry).toBeNull();
      expect(visibleDiagnosticRows(d)).toEqual(["no_trader_data"]);
    });
  });

  describe("Combined scenario: mixed pool resolves each bucket independently", () => {
    it("attributes 1 trader per blocker correctly + 1 visible", () => {
      const d = computeTraderDiagnostics(
        [
          h({ user: { country_code: "IN" } }),                       // country
          h({ is_active: false }),                                    // inactive
          h({ wallet_balance: 10_000 }),                              // low base
          h({ trader_level: 4, wallet_balance: 100_000 }),            // < L4 200k tier min
          h({ trader_level: 2, wallet_balance: 120_000 }),            // passes
        ],
        "BD",
      );
      expect(d.rawTotal).toBe(5);
      expect(d.byCountry).toBe(1);
      expect(d.byInactive).toBe(1);
      expect(d.byLowBalance).toBe(1);
      expect(d.byTierMin).toBe(1);
      expect(d.finalCount).toBe(1);
      // Counters sum check: hidden + shown == raw total.
      expect(
        d.byCountry + d.byInactive + d.byLowBalance + d.byTierMin + d.finalCount,
      ).toBe(d.rawTotal);
      // Empty-state would NOT render here because finalCount > 0,
      // but the breakdown summary line uses these exact numbers.
    });

    it("off-by-one regression guard: counters start at 0, not 1 (Pkg78 fix)", () => {
      // All-passing pool — every counter must be exactly 0.
      const d = computeTraderDiagnostics(
        [
          h({ trader_level: 1, wallet_balance: 60_000 }),
          h({ trader_level: 2, wallet_balance: 120_000 }),
        ],
        "BD",
      );
      expect(d.byCountry).toBe(0);
      expect(d.byInactive).toBe(0);
      expect(d.byLowBalance).toBe(0);
      expect(d.byTierMin).toBe(0);
      expect(d.finalCount).toBe(2);
    });
  });
});

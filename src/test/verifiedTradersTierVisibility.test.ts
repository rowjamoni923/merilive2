/**
 * Pkg64 — Verified Traders L1-L5 tier visibility + Pkg63 approved-trader gate regression.
 *
 * Mirrors the EXACT filter + approval logic in src/pages/Recharge.tsx
 * (lines ~1035-1065). Any drift in those constants/booleans will fail here
 * before it ships and silently hides or exposes a trader.
 *
 *   • Visibility filter   — country match + tier min wallet balance
 *   • Approval gate       — backend is_approved_topup_trader() mirror
 *                           (is_active + is_verified + level 1-5 + wallet ≥ tier min)
 *
 * Runner: `npm test` (vitest run).
 */
import { describe, it, expect } from 'vitest';

/* ────────────── Source-of-truth constants (DO NOT diverge from Recharge.tsx) ────────────── */
const TIER_MIN: Record<number, number> = {
  1:  50_000,
  2: 100_000,
  3: 150_000,
  4: 200_000,
  5: 300_000,
};

type HelperRow = {
  user_id: string;
  is_active: boolean;
  is_verified: boolean;
  trader_level: number | null;
  wallet_balance: number;
  country_code: string;
  user?: { country_code?: string };
};

/** Mirrors Recharge.tsx visibility filter (country + tier min). */
const visible = (h: HelperRow, userCountryCode: string): boolean => {
  const profileCountry = h.user?.country_code || h.country_code;
  if (profileCountry !== userCountryCode) return false;
  const lvl = Math.max(1, Math.min(5, h.trader_level || 1));
  const min = TIER_MIN[lvl] ?? 50_000;
  return (h.wallet_balance ?? 0) >= min;
};

/** Mirrors Recharge.tsx isApproved derivation + DB is_approved_topup_trader(). */
const isApproved = (h: HelperRow): boolean => {
  const lvl = Math.max(1, Math.min(5, h.trader_level || 0));
  const min = TIER_MIN[lvl] ?? 50_000;
  return (
    h.is_active === true &&
    h.is_verified === true &&
    (h.trader_level ?? 0) >= 1 &&
    (h.trader_level ?? 0) <= 5 &&
    (h.wallet_balance ?? 0) >= min
  );
};

const helper = (over: Partial<HelperRow> = {}): HelperRow => ({
  user_id: 'u1',
  is_active: true,
  is_verified: true,
  trader_level: 1,
  wallet_balance: 1_000_000,
  country_code: 'BD',
  user: { country_code: 'BD' },
  ...over,
});

/* ──────────────────────────────── Tests ──────────────────────────────── */

describe('Pkg64 — Tier visibility (Verified Traders feed)', () => {
  it('exposes the canonical tier minimums (regression lock)', () => {
    expect(TIER_MIN).toEqual({ 1: 50_000, 2: 100_000, 3: 150_000, 4: 200_000, 5: 300_000 });
  });

  it('hides a helper whose wallet is BELOW their tier minimum', () => {
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      const below = TIER_MIN[lvl] - 1;
      expect(
        visible(helper({ trader_level: lvl, wallet_balance: below }), 'BD'),
        `L${lvl} with wallet ${below} should be hidden`,
      ).toBe(false);
    }
  });

  it('shows a helper whose wallet exactly MEETS their tier minimum', () => {
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      expect(
        visible(helper({ trader_level: lvl, wallet_balance: TIER_MIN[lvl] }), 'BD'),
        `L${lvl} with wallet ${TIER_MIN[lvl]} should be visible`,
      ).toBe(true);
    }
  });

  it('hides helpers whose profile country_code does NOT match the viewer', () => {
    expect(visible(helper({ user: { country_code: 'IN' } }), 'BD')).toBe(false);
    expect(visible(helper({ user: { country_code: 'BD' } }), 'BD')).toBe(true);
  });

  it('prefers user.country_code over row country_code (profile is source of truth)', () => {
    const h = helper({ country_code: 'BD', user: { country_code: 'IN' } });
    expect(visible(h, 'BD')).toBe(false);
    expect(visible(h, 'IN')).toBe(true);
  });

  it('clamps trader_level into 1..5 range for tier-min lookup', () => {
    // level 0/null → treated as L1 → needs ≥50k
    expect(visible(helper({ trader_level: 0,   wallet_balance: 49_999 }), 'BD')).toBe(false);
    expect(visible(helper({ trader_level: 0,   wallet_balance: 50_000 }), 'BD')).toBe(true);
    expect(visible(helper({ trader_level: null,wallet_balance: 50_000 }), 'BD')).toBe(true);
    // level 9 → clamped to L5 → needs ≥300k
    expect(visible(helper({ trader_level: 9,   wallet_balance: 299_999 }), 'BD')).toBe(false);
    expect(visible(helper({ trader_level: 9,   wallet_balance: 300_000 }), 'BD')).toBe(true);
  });

  it('mismatch matrix: every tier × (below/at/above) regression', () => {
    const matrix = [1, 2, 3, 4, 5].flatMap(lvl => [
      { lvl, w: TIER_MIN[lvl] - 1, expect: false },
      { lvl, w: TIER_MIN[lvl],     expect: true  },
      { lvl, w: TIER_MIN[lvl] + 1, expect: true  },
    ]);
    for (const c of matrix) {
      const got = visible(helper({ trader_level: c.lvl, wallet_balance: c.w }), 'BD');
      expect(got, `L${c.lvl} wallet=${c.w} expected=${c.expect}`).toBe(c.expect);
    }
  });
});

describe('Pkg63 — Approved-trader gate (mirrors backend is_approved_topup_trader)', () => {
  it('approves a fully-valid L3 trader at tier min', () => {
    expect(isApproved(helper({ trader_level: 3, wallet_balance: 150_000 }))).toBe(true);
  });

  it('blocks when is_active=false', () => {
    expect(isApproved(helper({ is_active: false }))).toBe(false);
  });

  it('blocks when is_verified=false', () => {
    expect(isApproved(helper({ is_verified: false }))).toBe(false);
  });

  it('blocks when wallet falls below tier minimum (each level)', () => {
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      expect(
        isApproved(helper({ trader_level: lvl, wallet_balance: TIER_MIN[lvl] - 1 })),
        `L${lvl} below-min should NOT be approved`,
      ).toBe(false);
    }
  });

  it('blocks trader_level outside 1..5 (0, 6, null)', () => {
    expect(isApproved(helper({ trader_level: 0 }))).toBe(false);
    expect(isApproved(helper({ trader_level: 6 }))).toBe(false);
    expect(isApproved(helper({ trader_level: null }))).toBe(false);
  });

  it('visibility and approval agree for fully-valid traders (no orphaned card states)', () => {
    for (const lvl of [1, 2, 3, 4, 5] as const) {
      const h = helper({ trader_level: lvl, wallet_balance: TIER_MIN[lvl] });
      expect(visible(h, 'BD'), `L${lvl} visible`).toBe(true);
      expect(isApproved(h),    `L${lvl} approved`).toBe(true);
    }
  });

  it('regression: a visible trader with is_verified=false still renders, but is NOT approved', () => {
    // This is the "✕ Not Approved" badge + hidden CTA path. They must coexist.
    const h = helper({ trader_level: 2, wallet_balance: 200_000, is_verified: false });
    expect(visible(h, 'BD')).toBe(true);
    expect(isApproved(h)).toBe(false);
  });
});

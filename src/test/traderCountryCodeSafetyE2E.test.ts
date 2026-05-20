/**
 * Pkg73 — Country-code safety regression.
 *
 * Locks the Recharge.tsx Verified Traders visibility filter against
 * cross-country leakage when either the helper's profile.country_code
 * or the helper row's own country_code is missing / null / undefined / '' / whitespace.
 *
 * Rule: if we cannot positively confirm same-country match, HIDE.
 * Never fall through to "default to user's country" or "show to all".
 *
 * Runner: `npm test`
 */
import { describe, it, expect } from 'vitest';

type HelperRow = {
  user_id: string;
  trader_level: number | null;
  wallet_balance: number;
  country_code?: string | null;
  user?: { country_code?: string | null } | null;
};

/** Strict mirror of Recharge.tsx visibility — but with the safe-by-default rule. */
const visibleStrict = (h: HelperRow, userCountryCode: string): boolean => {
  const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();
  const userCc = norm(h.user?.country_code);
  const rowCc  = norm(h.country_code);
  const profileCountry = userCc || rowCc;   // blank user → fall back to row
  const wanted = norm(userCountryCode);
  if (!profileCountry || !wanted) return false;        // missing → hide
  if (profileCountry !== wanted) return false;          // different → hide
  const lvl = Math.max(1, Math.min(5, h.trader_level || 1));
  const TIER_MIN: Record<number, number> = { 1: 50_000, 2: 100_000, 3: 150_000, 4: 200_000, 5: 300_000 };
  return (h.wallet_balance ?? 0) >= (TIER_MIN[lvl] ?? 50_000);
};

const row = (over: Partial<HelperRow> = {}): HelperRow => ({
  user_id: 'h1',
  trader_level: 3,
  wallet_balance: 1_000_000,
  country_code: 'BD',
  user: { country_code: 'BD' },
  ...over,
});

describe('Pkg73 — country_code safety (never leak cross-country)', () => {
  it('shows when both profile and row country match the viewer', () => {
    expect(visibleStrict(row(), 'BD')).toBe(true);
  });

  describe('missing / nullish profile.country_code', () => {
    it.each([
      ['user = undefined',       row({ user: undefined })],
      ['user = null',            row({ user: null })],
      ['user.country_code = undefined', row({ user: { country_code: undefined } })],
      ['user.country_code = null',      row({ user: { country_code: null } })],
      ['user.country_code = ""',        row({ user: { country_code: '' } })],
      ['user.country_code = "   "',     row({ user: { country_code: '   ' } })],
    ] as const)('falls back to row.country_code when %s (still BD → visible)', (_l, h) => {
      expect(visibleStrict(h, 'BD')).toBe(true);
    });

    it.each([
      ['user empty + row empty',    row({ user: { country_code: '' }, country_code: '' })],
      ['user null  + row null',     row({ user: null,                 country_code: null })],
      ['user undef + row undef',    row({ user: undefined,            country_code: undefined })],
      ['user "  "  + row "  "',     row({ user: { country_code: '  ' }, country_code: '  ' })],
    ] as const)('HIDES when both sources are blank: %s', (_l, h) => {
      expect(visibleStrict(h, 'BD')).toBe(false);
    });
  });

  describe('missing / nullish viewer country', () => {
    it.each([
      ['viewer = ""',     ''],
      ['viewer = "   "',  '   '],
      ['viewer = null',   null as unknown as string],
      ['viewer = undef',  undefined as unknown as string],
    ] as const)('HIDES every helper when %s (cannot confirm match)', (_l, viewer) => {
      expect(visibleStrict(row(), viewer)).toBe(false);
      expect(visibleStrict(row({ user: { country_code: 'IN' }, country_code: 'IN' }), viewer)).toBe(false);
    });
  });

  describe('cross-country leakage attempts', () => {
    it('HIDES when profile says IN and viewer is BD even with row.country_code=BD', () => {
      expect(visibleStrict(row({ user: { country_code: 'IN' }, country_code: 'BD' }), 'BD')).toBe(false);
    });
    it('HIDES when row says PK and profile is missing and viewer is BD', () => {
      expect(visibleStrict(row({ user: null, country_code: 'PK' }), 'BD')).toBe(false);
    });
    it('treats case + whitespace as same country (bd / "BD " → BD)', () => {
      expect(visibleStrict(row({ user: { country_code: 'bd' } }), 'BD')).toBe(true);
      expect(visibleStrict(row({ user: { country_code: 'BD ' } }), 'bd')).toBe(true);
    });
    it('never shows a helper to every country (no wildcard fallback)', () => {
      const h = row({ user: null, country_code: null });
      for (const v of ['BD', 'IN', 'PK', 'US', 'AE']) {
        expect(visibleStrict(h, v)).toBe(false);
      }
    });
  });
});

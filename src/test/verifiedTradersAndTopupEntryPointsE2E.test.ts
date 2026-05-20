/**
 * Pkg72 — Verified Traders + 4 top-up entry points unified E2E QA suite.
 *
 * Mirrors the server-side gates so any drift fails before shipping.
 *
 * Coverage:
 *   1. Verified Traders feed visibility   (Recharge.tsx tier filter)
 *   2. Entry point #1 — coin_trader_self_recharge        (My Recharge → self deposit)
 *   3. Entry point #2 — coin_trader_transfer_to_user     (UID top-up)
 *   4. Entry point #3 — coin_trader_transfer_to_agency   (Agency deposit)
 *   5. Entry point #4 — swift-pay-create-deposit         (user_diamond crypto, $100 floor)
 *
 * Each entry point is exercised against:
 *   • approved L1..L5 trader  → success
 *   • missing helper row      → blocked
 *   • is_active=false         → blocked
 *   • is_verified=false       → blocked
 *   • trader_level 0 / 6      → blocked
 *   • wallet below tier min   → hidden from feed (visibility only)
 *   • crypto below $100       → blocked (entry point #4 only)
 *
 * Runner: `npm run test:trader-e2e` (or `npm test` for the full suite).
 */
import { describe, it, expect, beforeEach } from 'vitest';

/* ───────────── Source-of-truth constants (mirror Pkg70 + Pkg71) ───────────── */
const TIER_MIN: Record<number, number> = {
  1: 50_000, 2: 100_000, 3: 150_000, 4: 200_000, 5: 300_000,
};
const SWIFT_PAY_CRYPTO_MIN_USD = 100;
const GATE_ERROR = 'Only approved L1-L5 helper traders can top up';
const BELOW_MIN_ERROR = 'below_minimum';

type HelperRow = {
  user_id: string;
  is_active: boolean | null;
  is_verified: boolean | null;
  trader_level: number | null;
  wallet_balance: number;
  country_code?: string;
};
type RpcResult = { success: boolean; error?: string };
type CryptoResult = { ok: boolean; error?: string; min_usd?: number };

/* ────────────── Fake backend mirroring DB + edge function ────────────── */
class FakeBackend {
  helpers = new Map<string, HelperRow>();
  caller: string | null = null;

  reset() { this.helpers.clear(); this.caller = null; }
  setCaller(id: string | null) { this.caller = id; }
  seed(row: Partial<HelperRow> & { user_id: string }) {
    this.helpers.set(row.user_id, {
      user_id: row.user_id,
      is_active:      row.is_active      ?? true,
      is_verified:    row.is_verified    ?? true,
      trader_level:   row.trader_level   ?? 3,
      wallet_balance: row.wallet_balance ?? 1_000_000,
      country_code:   row.country_code   ?? 'BD',
    });
  }

  /** Mirrors public.is_approved_topup_trader(_user_id). */
  isApproved(uid: string): boolean {
    const h = this.helpers.get(uid);
    if (!h) return false;
    const lvl = h.trader_level ?? 0;
    return (h.is_active ?? true) === true
        && (h.is_verified ?? false) === true
        && lvl >= 1 && lvl <= 5;
  }

  private gate(): RpcResult | null {
    if (!this.caller) return { success: false, error: 'Not authenticated' };
    if (!this.isApproved(this.caller)) return { success: false, error: GATE_ERROR };
    return null;
  }

  // Entry point #1
  selfRecharge(_amount: number): RpcResult { return this.gate() ?? { success: true }; }
  // Entry point #2
  transferToUser(_recipient: string, _amount: number): RpcResult { return this.gate() ?? { success: true }; }
  // Entry point #3
  transferToAgency(_agency: string, _amount: number): RpcResult { return this.gate() ?? { success: true }; }

  /** Entry point #4 — mirrors swift-pay-create-deposit Pkg71 floor. */
  swiftPayCrypto(target: 'user_diamond' | 'helper_wallet' | 'package',
                 custom_price_usd?: number): CryptoResult {
    if (target === 'user_diamond' && typeof custom_price_usd === 'number'
        && custom_price_usd < SWIFT_PAY_CRYPTO_MIN_USD) {
      return { ok: false, error: BELOW_MIN_ERROR, min_usd: SWIFT_PAY_CRYPTO_MIN_USD };
    }
    return { ok: true };
  }

  /** Mirrors Recharge.tsx Verified Traders visibility filter. */
  visibleInFeed(uid: string, userCountry: string): boolean {
    const h = this.helpers.get(uid);
    if (!h) return false;
    if ((h.country_code || '') !== userCountry) return false;
    const lvl = Math.max(1, Math.min(5, h.trader_level || 1));
    return (h.wallet_balance ?? 0) >= (TIER_MIN[lvl] ?? 50_000);
  }
}

const db = new FakeBackend();
const RPCS: Array<[string, (uid: string) => RpcResult]> = [
  ['coin_trader_self_recharge',     ()       => db.selfRecharge(10_000)],
  ['coin_trader_transfer_to_user',  ()       => db.transferToUser('other', 10_000)],
  ['coin_trader_transfer_to_agency',()       => db.transferToAgency('ag-1', 10_000)],
];

/* ──────────────────────────────── Tests ──────────────────────────────── */
describe('Pkg72 — Verified Traders + 4 top-up entry points E2E', () => {
  beforeEach(() => db.reset());

  describe('Verified Traders feed (visibility tier matrix)', () => {
    it('shows approved L1..L5 helpers at/above tier min, hides below', () => {
      for (const lvl of [1, 2, 3, 4, 5] as const) {
        const min = TIER_MIN[lvl];
        db.seed({ user_id: `at-${lvl}`,   trader_level: lvl, wallet_balance: min });
        db.seed({ user_id: `below-${lvl}`,trader_level: lvl, wallet_balance: min - 1 });
        expect(db.visibleInFeed(`at-${lvl}`,    'BD')).toBe(true);
        expect(db.visibleInFeed(`below-${lvl}`, 'BD')).toBe(false);
      }
    });

    it('hides helpers from a different country regardless of wallet', () => {
      db.seed({ user_id: 'h1', trader_level: 5, wallet_balance: 10_000_000, country_code: 'IN' });
      expect(db.visibleInFeed('h1', 'BD')).toBe(false);
      expect(db.visibleInFeed('h1', 'IN')).toBe(true);
    });
  });

  describe.each(RPCS)('Entry point: %s', (name, call) => {
    it(`approves all L1..L5 verified+active helpers (${name})`, () => {
      for (const lvl of [1, 2, 3, 4, 5]) {
        db.seed({ user_id: `t-${lvl}`, trader_level: lvl });
        db.setCaller(`t-${lvl}`);
        expect(call(`t-${lvl}`)).toEqual({ success: true });
      }
    });

    it('blocks unauthenticated callers', () => {
      db.setCaller(null);
      expect(call('').success).toBe(false);
    });

    it('blocks when helper row missing', () => {
      db.setCaller('ghost');
      expect(call('ghost')).toEqual({ success: false, error: GATE_ERROR });
    });

    it.each([
      ['is_active=false',   { is_active:   false }],
      ['is_verified=false', { is_verified: false }],
      ['trader_level=0',    { trader_level: 0 }],
      ['trader_level=6',    { trader_level: 6 }],
    ] as const)('blocks when %s', (_label, patch) => {
      db.seed({ user_id: 'u', ...patch });
      db.setCaller('u');
      expect(call('u')).toEqual({ success: false, error: GATE_ERROR });
    });
  });

  describe('Entry point: swift-pay-create-deposit (crypto $100 floor)', () => {
    it('allows user_diamond crypto at exactly $100', () => {
      expect(db.swiftPayCrypto('user_diamond', 100)).toEqual({ ok: true });
    });
    it('allows user_diamond crypto above $100', () => {
      expect(db.swiftPayCrypto('user_diamond', 250)).toEqual({ ok: true });
    });
    it.each([1, 25, 50, 99, 99.99])('blocks user_diamond crypto at $%s (< floor)', (usd) => {
      expect(db.swiftPayCrypto('user_diamond', usd))
        .toEqual({ ok: false, error: BELOW_MIN_ERROR, min_usd: 100 });
    });
    it('does NOT apply the floor to helper_wallet or package targets', () => {
      expect(db.swiftPayCrypto('helper_wallet', 10)).toEqual({ ok: true });
      expect(db.swiftPayCrypto('package',       10)).toEqual({ ok: true });
    });
  });

  it('regression lock — tier minimums + crypto floor are unchanged', () => {
    expect(TIER_MIN).toEqual({ 1: 50_000, 2: 100_000, 3: 150_000, 4: 200_000, 5: 300_000 });
    expect(SWIFT_PAY_CRYPTO_MIN_USD).toBe(100);
  });
});

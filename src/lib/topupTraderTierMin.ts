/**
 * Pkg70 — Top-up trader tier-min wallet thresholds (admin configurable).
 *
 * Source of truth: `app_settings.topup_trader_tier_min_wallet` (jsonb)
 *   shape: { "1": 50000, "2": 100000, "3": 150000, "4": 200000, "5": 300000 }
 *
 * Frontend-only gate that controls Verified Traders visibility on /recharge
 * and the min-wallet display in Admin → Topup Trader Approvals. The DB gate
 * (`is_approved_topup_trader`) does not enforce these minimums.
 */

export type TierMinMap = Record<number, number>;

export const DEFAULT_TIER_MIN: TierMinMap = {
  1: 50000,
  2: 100000,
  3: 150000,
  4: 200000,
  5: 300000,
};

export const TIER_MIN_SETTING_KEY = 'topup_trader_tier_min_wallet';

/** Parse an `app_settings.setting_value` jsonb blob into a numeric TierMinMap. */
export function parseTierMinSetting(raw: unknown): TierMinMap {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TIER_MIN };
  const out: TierMinMap = { ...DEFAULT_TIER_MIN };
  for (let lvl = 1; lvl <= 5; lvl++) {
    const v = (raw as Record<string, unknown>)[String(lvl)];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= 0) out[lvl] = Math.floor(n);
  }
  return out;
}

/** Clamp + lookup helper that guarantees a positive minimum for any input level. */
export function getTierMin(map: TierMinMap | null | undefined, level: number | null | undefined): number {
  const lvl = Math.max(1, Math.min(5, Number(level) || 1));
  const fromMap = map?.[lvl];
  if (Number.isFinite(fromMap) && (fromMap as number) >= 0) return fromMap as number;
  return DEFAULT_TIER_MIN[lvl];
}

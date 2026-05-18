/**
 * Single source of truth for Trader Wallet top-up USD → diamonds math.
 * Server mirror: public.admin_approve_helper_topup
 *   _diamonds := floor(_amount * 100000.0 / _usd_per_100k)
 *
 * Keep this formula identical to the SQL function — covered by
 * src/utils/__tests__/traderWalletTopupRate.test.ts
 */

export type TopupRateConfig =
  | { usd_per_100k_diamonds?: number | string | null }
  | number
  | null
  | undefined;

export interface ValidatedRate {
  ok: boolean;
  rate?: number;
  error?: string;
}

/**
 * Normalize whatever shape `app_settings.trader_wallet_topup_rate` returns
 * (object | bare number | string | null) into a strict positive number.
 */
export function validateTopupRate(cfg: TopupRateConfig): ValidatedRate {
  let raw: number | string | null | undefined;
  if (typeof cfg === "number") {
    raw = cfg;
  } else if (cfg && typeof cfg === "object") {
    raw = cfg.usd_per_100k_diamonds;
  } else {
    raw = null;
  }

  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, error: "trader_wallet_topup_rate not configured" };
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "Invalid trader_wallet_topup_rate value" };
  }
  return { ok: true, rate: n };
}

export interface ValidatedUsd {
  ok: boolean;
  usd?: number;
  error?: string;
}

export function validateUsdAmount(input: number | string | null | undefined): ValidatedUsd {
  if (input === null || input === undefined || input === "") {
    return { ok: false, error: "Enter a USD amount" };
  }
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "Invalid USD amount" };
  }
  return { ok: true, usd: n };
}

/**
 * Deterministic USD → diamonds formula. Matches SQL FLOOR semantics.
 * Throws on invalid input so callers cannot silently credit 0.
 */
export function usdToDiamonds(usd: number, usdPer100kDiamonds: number): number {
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error("usdToDiamonds: invalid usd");
  }
  if (!Number.isFinite(usdPer100kDiamonds) || usdPer100kDiamonds <= 0) {
    throw new Error("usdToDiamonds: invalid rate");
  }
  return Math.floor((usd * 100000) / usdPer100kDiamonds);
}

/**
 * One-shot helper used by the admin approve modal:
 *   - validates rate config
 *   - validates USD input
 *   - returns either { ok, diamonds, rate, usd } or { ok:false, error }
 */
export function computeTopupApproval(
  rateCfg: TopupRateConfig,
  usdInput: number | string | null | undefined
):
  | { ok: true; diamonds: number; rate: number; usd: number }
  | { ok: false; error: string } {
  const r = validateTopupRate(rateCfg);
  if (!r.ok) return { ok: false, error: r.error! };
  const u = validateUsdAmount(usdInput);
  if (!u.ok) return { ok: false, error: u.error! };
  const diamonds = usdToDiamonds(u.usd!, r.rate!);
  if (diamonds <= 0) {
    return { ok: false, error: "Computed diamonds <= 0; check rate or USD amount" };
  }
  return { ok: true, diamonds, rate: r.rate!, usd: u.usd! };
}

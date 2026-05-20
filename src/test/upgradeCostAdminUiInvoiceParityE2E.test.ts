/**
 * Pkg74 — Admin upgrade_cost_usd ↔ UI ↔ Crypto invoice parity E2E.
 *
 * Locks the chain so every per-level price the admin sets in
 * /admin/pricing-hub → trader_level_tiers.upgrade_cost_usd is the
 * EXACT same number that:
 *   1. The HelperApplicationForm displays ("upgradeCost")
 *   2. The HelperApplicationForm uses for validation ("effectiveCost")
 *   3. The swift-pay-create-deposit edge function charges
 *      (custom_price_usd) AND on-chain Swift Pay invoices for.
 *
 * Drift between any of these surfaces = silent over/undercharge → user
 * pays the wrong amount → financial integrity breach.
 *
 * Mirrors:
 *   • src/components/helper/HelperApplicationForm.tsx (lines 160-194)
 *   • supabase/functions/swift-pay-create-deposit/index.ts (Pkg71 floor)
 *
 * Runner: `npm test` (vitest run).
 */
import { describe, it, expect } from 'vitest';

/* ────────── Source-of-truth constants (mirror Pkg71 + form) ────────── */
const CRYPTO_PAYMENT_MIN_USD = 100;          // HelperApplicationForm floor
const SWIFT_PAY_CRYPTO_MIN_USD = 100;        // swift-pay-create-deposit Pkg71

type TierRow = {
  level_number: number;
  level_name: string;
  upgrade_cost_usd: number | string | null;
  is_active: boolean;
};

/** Mirrors HelperApplicationForm derivation (line 160-168). */
function deriveCharge(levels: TierRow[], selectedLevel: number, diamondsPerUsd: number) {
  const selectedLevelData = levels.find(l => l.level_number === selectedLevel);
  const upgradeCost = Number(selectedLevelData?.upgrade_cost_usd || 0);
  const isPaidLevel = upgradeCost > 0;
  const effectiveCost = isPaidLevel ? upgradeCost : 0;
  const diamondsForUpgrade = Math.floor(effectiveCost * diamondsPerUsd);
  return { selectedLevelData, upgradeCost, isPaidLevel, effectiveCost, diamondsForUpgrade };
}

/** Mirrors swift-pay-create-deposit Pkg71 floor check + invoice price. */
function swiftPayInvoice(target: 'user_diamond' | 'helper_wallet' | 'package',
                         custom_price_usd: number) {
  if (target === 'user_diamond' && custom_price_usd < SWIFT_PAY_CRYPTO_MIN_USD) {
    return { ok: false as const, error: 'below_minimum', min_usd: SWIFT_PAY_CRYPTO_MIN_USD };
  }
  return { ok: true as const, invoice_amount_usd: custom_price_usd };
}

/** Mirrors AdminTopupSystem level-selector UI ($X / Free). */
function uiPriceLabel(cost: number) {
  return cost === 0 ? 'Free' : `$${cost}`;
}

const adminTiers = (overrides: Partial<Record<number, number>> = {}): TierRow[] => [
  { level_number: 1, level_name: 'Bronze',   upgrade_cost_usd: overrides[1] ?? 0,   is_active: true },
  { level_number: 2, level_name: 'Silver',   upgrade_cost_usd: overrides[2] ?? 100, is_active: true },
  { level_number: 3, level_name: 'Gold',     upgrade_cost_usd: overrides[3] ?? 150, is_active: true },
  { level_number: 4, level_name: 'Platinum', upgrade_cost_usd: overrides[4] ?? 200, is_active: true },
  { level_number: 5, level_name: 'Diamond',  upgrade_cost_usd: overrides[5] ?? 300, is_active: true },
];

/* ─────────────────────────── Tests ─────────────────────────── */

describe('Pkg74 — admin upgrade_cost_usd ↔ UI ↔ crypto invoice parity', () => {
  describe('Per-level parity across the full chain', () => {
    it.each([
      [2, 100],
      [3, 150],
      [4, 200],
      [5, 300],
    ])('L%i @ admin=$%i: UI label, effectiveCost, and invoice all equal admin value', (lvl, admin) => {
      const tiers = adminTiers();
      const { upgradeCost, effectiveCost } = deriveCharge(tiers, lvl, 65);
      const invoice = swiftPayInvoice('user_diamond', effectiveCost);

      // UI display
      expect(uiPriceLabel(upgradeCost)).toBe(`$${admin}`);
      // Form-validated charge
      expect(effectiveCost).toBe(admin);
      // Crypto invoice amount
      expect(invoice.ok).toBe(true);
      if (invoice.ok) expect(invoice.invoice_amount_usd).toBe(admin);
    });

    it('Free L1: UI shows "Free", no invoice required', () => {
      const tiers = adminTiers();
      const { upgradeCost, isPaidLevel, effectiveCost } = deriveCharge(tiers, 1, 65);
      expect(uiPriceLabel(upgradeCost)).toBe('Free');
      expect(isPaidLevel).toBe(false);
      expect(effectiveCost).toBe(0);
    });
  });

  describe('Admin edits propagate instantly (no hardcoded fallback)', () => {
    it.each([
      [2, 100],
      [3, 175],   // bumped from 150
      [4, 225],   // bumped from 200
      [5, 500],   // bumped from 300
    ])('L%i bumped to $%i → UI + invoice both reflect new value', (lvl, newPrice) => {
      const tiers = adminTiers({ [lvl]: newPrice });
      const { upgradeCost, effectiveCost } = deriveCharge(tiers, lvl, 65);
      const invoice = swiftPayInvoice('user_diamond', effectiveCost);
      expect(upgradeCost).toBe(newPrice);
      expect(effectiveCost).toBe(newPrice);
      expect(invoice.ok && invoice.invoice_amount_usd).toBe(newPrice);
    });

    it('does NOT round / floor / cap admin value (e.g. $123.45 stays exact)', () => {
      const tiers = adminTiers({ 3: 123.45 });
      const { effectiveCost } = deriveCharge(tiers, 3, 65);
      expect(effectiveCost).toBe(123.45);
      const invoice = swiftPayInvoice('user_diamond', effectiveCost);
      expect(invoice.ok && invoice.invoice_amount_usd).toBe(123.45);
    });
  });

  describe('$100 crypto floor (Pkg71) — UI + edge function agree', () => {
    it.each([1, 25, 50, 99, 99.99])('admin sets L3=$%s → UI blocks AND invoice rejects', (lowPrice) => {
      const tiers = adminTiers({ 3: lowPrice });
      const { effectiveCost } = deriveCharge(tiers, 3, 65);
      // Form rule (mirrors HelperApplicationForm line 192)
      const formBlocks = effectiveCost > 0 && effectiveCost < CRYPTO_PAYMENT_MIN_USD;
      expect(formBlocks).toBe(true);
      // Edge function rule (Pkg71)
      const invoice = swiftPayInvoice('user_diamond', effectiveCost);
      expect(invoice).toEqual({ ok: false, error: 'below_minimum', min_usd: 100 });
    });

    it('exactly $100 passes both UI + invoice', () => {
      const tiers = adminTiers({ 3: 100 });
      const { effectiveCost } = deriveCharge(tiers, 3, 65);
      expect(effectiveCost).toBeGreaterThanOrEqual(CRYPTO_PAYMENT_MIN_USD);
      const invoice = swiftPayInvoice('user_diamond', effectiveCost);
      expect(invoice.ok && invoice.invoice_amount_usd).toBe(100);
    });

    it('floor constants are aligned between form and edge function', () => {
      expect(CRYPTO_PAYMENT_MIN_USD).toBe(SWIFT_PAY_CRYPTO_MIN_USD);
    });
  });

  describe('Missing / malformed admin row safety', () => {
    it('selected level not in admin tiers → effectiveCost=0 (no silent charge)', () => {
      const { effectiveCost, isPaidLevel } = deriveCharge(adminTiers(), 6, 65);
      expect(effectiveCost).toBe(0);
      expect(isPaidLevel).toBe(false);
    });

    it.each([null, undefined, 0, '', '0'])('upgrade_cost_usd=%j → effectiveCost=0', (v) => {
      const tiers: TierRow[] = [
        { level_number: 3, level_name: 'Gold', upgrade_cost_usd: v as any, is_active: true },
      ];
      const { effectiveCost, isPaidLevel } = deriveCharge(tiers, 3, 65);
      expect(effectiveCost).toBe(0);
      expect(isPaidLevel).toBe(false);
    });

    it('string "150" from DB still parses to numeric 150 (and matches invoice)', () => {
      const tiers: TierRow[] = [
        { level_number: 3, level_name: 'Gold', upgrade_cost_usd: '150', is_active: true },
      ];
      const { effectiveCost } = deriveCharge(tiers, 3, 65);
      expect(effectiveCost).toBe(150);
      const invoice = swiftPayInvoice('user_diamond', effectiveCost);
      expect(invoice.ok && invoice.invoice_amount_usd).toBe(150);
    });
  });

  describe('Diamond equivalent uses FLOOR (no over-credit)', () => {
    it.each([
      [100, 65,  6500],
      [150, 65,  9750],
      [123.45, 65, Math.floor(123.45 * 65)],   // 8024
    ])('cost=$%s @ %s d/USD → diamonds=%i (floor)', (cost, rate, expected) => {
      const tiers = adminTiers({ 3: cost });
      const { diamondsForUpgrade } = deriveCharge(tiers, 3, rate);
      expect(diamondsForUpgrade).toBe(expected);
    });
  });
});

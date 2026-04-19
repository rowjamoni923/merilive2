-- ============================================
-- 1) UPDATE TRADER LEVEL TIERS — corrected amounts + commissions
-- ============================================
UPDATE public.trader_level_tiers
SET upgrade_cost_usd = 0, commission_rate = 0, level_name = 'Bronze Trader', badge_color = '#CD7F32', is_active = true
WHERE level_number = 1;

UPDATE public.trader_level_tiers
SET upgrade_cost_usd = 100, commission_rate = 0, level_name = 'Bronze Trader', badge_color = '#CD7F32', is_active = true
WHERE level_number = 1;

-- Use upsert via DELETE+INSERT for safety
DELETE FROM public.trader_level_tiers WHERE level_number BETWEEN 1 AND 5;

INSERT INTO public.trader_level_tiers
  (level_number, level_name, upgrade_cost_usd, min_withdrawal_amount, max_withdrawal_amount, commission_rate, badge_color, is_active)
VALUES
  (1, 'Bronze Trader',   100,   0,     0,      0,   '#CD7F32', true),
  (2, 'Silver Trader',   500,   0,     0,      1.5, '#C0C0C0', true),
  (3, 'Gold Trader',     1000,  0,     0,      2.5, '#FFD700', true),
  (4, 'Platinum Trader', 1500,  0,     0,      5,   '#E5E4E2', true),
  (5, 'Diamond Trader',  2500,  5000,  100000, 7,   '#B9F2FF', true);

-- ============================================
-- 2) RE-ACTIVATE ALL ORIGINAL PAYMENT METHODS
--    Helper Dashboard shows all; Agency form restricts by country (hardcoded per-country list)
-- ============================================
UPDATE public.topup_payment_methods
SET is_active = true,
    updated_at = now();

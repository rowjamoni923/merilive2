-- ============================================
-- 1) RESTORE TRADER LEVEL TIERS (table was empty)
-- ============================================
-- Safety: clear any partial rows then re-seed
DELETE FROM public.trader_level_tiers WHERE level_number BETWEEN 1 AND 5;

INSERT INTO public.trader_level_tiers
  (level_number, level_name, upgrade_cost_usd, min_withdrawal_amount, max_withdrawal_amount, commission_rate, badge_color, is_active)
VALUES
  (1, 'Bronze Trader',   0,    0,     0,      0,   '#CD7F32', true),
  (2, 'Silver Trader',   100,  0,     0,      0,   '#C0C0C0', true),
  (3, 'Gold Trader',     300,  0,     0,      0.5, '#FFD700', true),
  (4, 'Platinum Trader', 500,  0,     0,      1,   '#E5E4E2', true),
  (5, 'Diamond Trader',  1000, 5000,  100000, 2,   '#B9F2FF', true);

-- ============================================
-- 2) MANUAL PAYMENT METHODS — Only ePay + Binance
-- ============================================
-- Deactivate every other manual method (keeps history, hides from UI)
UPDATE public.topup_payment_methods
SET is_active = false,
    updated_at = now()
WHERE LOWER(method_type) NOT IN ('epay', 'binance');

-- Insert ePay if missing
INSERT INTO public.topup_payment_methods
  (name, method_type, account_name, account_number, payment_number, payment_instructions, is_active, display_order)
SELECT 'ePay', 'epay', 'MeriLive ePay', 'support@merilive.com', 'support@merilive.com',
       'Send the exact amount via ePay to the email shown, then submit the transaction reference.', true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.topup_payment_methods WHERE LOWER(method_type) = 'epay'
);

-- Insert Binance Pay if missing
INSERT INTO public.topup_payment_methods
  (name, method_type, account_name, account_number, payment_number, payment_instructions, is_active, display_order)
SELECT 'Binance Pay', 'binance', 'MeriLive Binance', '000000000', '000000000',
       'Send via Binance Pay using the Pay ID shown, then submit the Binance transaction ID.', true, 2
WHERE NOT EXISTS (
  SELECT 1 FROM public.topup_payment_methods WHERE LOWER(method_type) = 'binance'
);

-- Ensure ePay + Binance are active
UPDATE public.topup_payment_methods
SET is_active = true, updated_at = now()
WHERE LOWER(method_type) IN ('epay', 'binance');
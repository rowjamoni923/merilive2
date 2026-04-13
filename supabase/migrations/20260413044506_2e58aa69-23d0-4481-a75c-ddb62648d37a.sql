
-- Fix missing diamond credits for completed orders
-- Orders: 169000 + 7000 + 7000 = 183000 total
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  UPDATE profiles
  SET coins = COALESCE(coins, 0) + 183000,
      total_recharged = COALESCE(total_recharged, 0) + 183000
  WHERE id = '33fd2efe-ff62-489b-80f4-c497599dd893';

  -- Log transactions for audit
  INSERT INTO coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
  VALUES 
    ('33fd2efe-ff62-489b-80f4-c497599dd893', 169000, 'recharge', 'zinipay_fix', 'fix:6805e9ff', 'completed', 'Manual fix: order 6805e9ff completed but diamonds not credited'),
    ('33fd2efe-ff62-489b-80f4-c497599dd893', 7000, 'recharge', 'zinipay_fix', 'fix:03b69c20', 'completed', 'Manual fix: order 03b69c20 completed but diamonds not credited'),
    ('33fd2efe-ff62-489b-80f4-c497599dd893', 7000, 'recharge', 'zinipay_fix', 'fix:326443e7', 'completed', 'Manual fix: order 326443e7 completed but diamonds not credited');
END$$;

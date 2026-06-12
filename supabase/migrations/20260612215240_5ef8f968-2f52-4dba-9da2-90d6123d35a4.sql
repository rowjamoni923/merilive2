DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles
     SET user_level = 0, max_user_level = 0, updated_at = now()
   WHERE is_host = true AND gender = 'female'
     AND user_level >= 1
     AND COALESCE(total_recharged, 0) < 10000
     AND COALESCE((SELECT SUM(coins_amount) FROM coin_transactions
                    WHERE user_id = profiles.id AND status='completed'
                      AND transaction_type IN ('recharge','self_recharge')), 0) < 10000
     AND COALESCE((SELECT SUM(diamonds_amount) FROM payment_transactions
                    WHERE user_id = profiles.id AND status='completed'), 0) < 10000;
END $$;
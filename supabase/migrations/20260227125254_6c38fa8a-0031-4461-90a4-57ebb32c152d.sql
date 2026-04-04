
-- =====================================================
-- CRITICAL FIX: "operator does not exist: date = text"
-- ROOT CAUSE: user_task_progress.reset_date is DATE type
-- but functions pass TEXT ('YYYY-MM-DD') for comparison
-- This fires EVERY user task action = massive error spam
-- =====================================================

-- Fix 1: Convert reset_date from date to text
ALTER TABLE public.user_task_progress 
  ALTER COLUMN reset_date TYPE text USING reset_date::text;

-- Fix 2: Convert daily_login_claims.claimed_date from date to text
ALTER TABLE public.daily_login_claims 
  ALTER COLUMN claimed_date TYPE text USING claimed_date::text;

-- Fix 3: Convert new_host_live_bonus_progress.bonus_date from date to text
ALTER TABLE public.new_host_live_bonus_progress 
  ALTER COLUMN bonus_date TYPE text USING bonus_date::text;

-- Fix 4: Convert user_login_streaks.last_login_date from date to text
ALTER TABLE public.user_login_streaks 
  ALTER COLUMN last_login_date TYPE text USING last_login_date::text;

-- Fix 5: Update get_admin_dashboard_stats to use text comparison
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_today timestamp := CURRENT_DATE::timestamp;
  v_today_text text := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  v_result json;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'total_hosts', (SELECT count(*) FROM profiles WHERE is_host = true),
    'total_agencies', (SELECT count(*) FROM agencies WHERE is_active = true),
    'active_streams', (SELECT count(*) FROM live_streams WHERE is_active = true AND ended_at IS NULL),
    'active_party_rooms', (SELECT count(*) FROM party_rooms WHERE is_active = true),
    'total_gifts_today', COALESCE((SELECT sum(coin_amount) FROM gift_transactions WHERE created_at >= v_today), 0),
    'total_calls_today', (SELECT count(*) FROM private_calls WHERE created_at >= v_today),
    'online_users', (SELECT count(*) FROM profiles WHERE is_online = true),
    'blocked_users', (SELECT count(*) FROM profiles WHERE is_blocked = true),
    'blocked_agencies', (SELECT count(*) FROM agencies WHERE is_blocked = true),
    'pending_host_applications', (SELECT count(*) FROM host_applications WHERE status = 'pending'),
    'daily_reward_claims_today', (SELECT count(*) FROM daily_login_claims WHERE claimed_date = v_today_text),
    'daily_recharges_today', (SELECT count(*) FROM recharge_transactions WHERE created_at >= v_today)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Fix 6: Ensure profiles table has proper grants for realtime
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- Fix 7: Ensure private_calls has grants
GRANT SELECT, INSERT, UPDATE ON public.private_calls TO authenticated;
GRANT SELECT ON public.private_calls TO anon;

-- Fix 8: Ensure user_level_tiers has grants
GRANT SELECT ON public.user_level_tiers TO anon, authenticated;

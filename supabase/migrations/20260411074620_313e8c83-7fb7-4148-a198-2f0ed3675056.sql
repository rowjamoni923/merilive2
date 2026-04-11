
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'total_hosts', (SELECT COUNT(*) FROM profiles WHERE is_host = true),
    'total_agencies', (SELECT COUNT(*) FROM agencies WHERE is_active = true),
    'online_users', (SELECT COUNT(*) FROM profiles WHERE is_online = true),
    'active_streams', (SELECT COUNT(*) FROM live_streams WHERE is_active = true),
    'active_party_rooms', (SELECT COUNT(*) FROM party_rooms WHERE is_active = true),
    'total_gifts_today', (SELECT COALESCE(SUM(quantity), 0) FROM gift_transactions WHERE created_at >= CURRENT_DATE),
    'total_calls_today', (SELECT COUNT(*) FROM private_calls WHERE created_at >= CURRENT_DATE),
    'blocked_users', (SELECT COUNT(*) FROM profiles WHERE is_banned = true OR is_blocked = true),
    'blocked_agencies', (SELECT COUNT(*) FROM agencies WHERE is_blocked = true),
    'pending_host_applications', (SELECT COUNT(*) FROM host_applications WHERE status = 'pending'),
    'daily_reward_claims_today', (SELECT COUNT(*) FROM daily_login_claims WHERE claimed_at >= CURRENT_DATE),
    'daily_recharges_today', (SELECT COALESCE(SUM(coins_amount), 0) FROM coin_transactions WHERE created_at >= CURRENT_DATE AND transaction_type = 'purchase'),
    'pending_verifications', (SELECT COUNT(*) FROM face_verification_submissions WHERE status = 'pending'),
    'pending_withdrawals', (SELECT COUNT(*) FROM agency_withdrawals WHERE status = 'pending'),
    'today_new_users', (SELECT COUNT(*) FROM profiles WHERE created_at >= CURRENT_DATE),
    'today_revenue', (SELECT COALESCE(SUM(coins_amount), 0) FROM coin_transactions WHERE created_at >= CURRENT_DATE AND transaction_type = 'purchase')
  ) INTO result;
  
  RETURN result;
END;
$$;

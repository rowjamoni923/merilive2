
DROP FUNCTION IF EXISTS public.get_admin_dashboard_stats();

CREATE FUNCTION public.get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_today date := CURRENT_DATE;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'total_hosts', (SELECT count(*) FROM profiles WHERE is_host = true),
    'total_agencies', (SELECT count(*) FROM agencies WHERE is_active = true),
    'active_streams', (SELECT count(*) FROM live_streams WHERE is_active = true AND ended_at IS NULL),
    'active_party_rooms', (SELECT count(*) FROM party_rooms WHERE status = 'active'),
    'total_gifts_today', COALESCE((SELECT sum(beans_amount) FROM gift_transactions WHERE created_at >= v_today::timestamp), 0),
    'total_calls_today', (SELECT count(*) FROM private_calls WHERE created_at >= v_today::timestamp),
    'online_users', (SELECT count(*) FROM profiles WHERE is_online = true),
    'blocked_users', (SELECT count(*) FROM profiles WHERE is_blocked = true),
    'blocked_agencies', (SELECT count(*) FROM agencies WHERE is_blocked = true),
    'pending_host_applications', (SELECT count(*) FROM host_applications WHERE status = 'pending'),
    'daily_reward_claims_today', (SELECT count(*) FROM daily_login_claims WHERE claimed_date = v_today::text),
    'daily_recharges_today', (SELECT count(*) FROM recharge_transactions WHERE created_at >= v_today::timestamp)
  ) INTO result;
  
  RETURN result;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today timestamp := CURRENT_DATE::timestamp;
  v_today_text text := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  r json;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT COALESCE(c.reltuples,0)::bigint FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname='profiles' AND n.nspname='public'),
    'total_hosts', (SELECT count(*) FROM profiles WHERE is_host=true),
    'total_agencies', (SELECT count(*) FROM agencies WHERE is_active=true),
    'active_streams', (SELECT count(*) FROM live_streams WHERE is_active=true AND ended_at IS NULL),
    'active_party_rooms', (SELECT count(*) FROM party_rooms WHERE is_active=true),
    'total_gifts_today', COALESCE((SELECT sum(coin_amount) FROM gift_transactions WHERE created_at>=v_today),0),
    'total_calls_today', (SELECT count(*) FROM private_calls WHERE created_at>=v_today),
    'online_users', (SELECT count(*) FROM profiles WHERE is_online=true),
    'blocked_users', (SELECT count(*) FROM profiles WHERE is_blocked=true),
    'blocked_agencies', (SELECT count(*) FROM agencies WHERE is_blocked=true),
    'pending_host_applications', (SELECT count(*) FROM face_verification_submissions WHERE status='pending'),
    'daily_reward_claims_today', (SELECT count(*) FROM daily_login_claims WHERE claimed_date=v_today_text),
    'daily_recharges_today', (
      (SELECT count(*) FROM recharge_transactions WHERE created_at>=v_today)
      + (SELECT count(*) FROM helper_orders WHERE created_at>=v_today AND status='completed')
      + (SELECT count(*) FROM coin_transfers WHERE created_at>=v_today AND status='completed')
    )
  ) INTO r;
  RETURN r;
END;
$$;

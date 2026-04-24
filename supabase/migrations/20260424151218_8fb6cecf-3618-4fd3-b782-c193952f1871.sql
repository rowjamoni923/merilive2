-- Extend get_admin_dashboard_stats to also include daily active counts and recent activity preview,
-- so AdminDashboard makes ONE round trip instead of 4.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today timestamp with time zone := date_trunc('day', now());
  v_total_users bigint;
  v_total_hosts bigint;
  v_total_agencies bigint;
  v_total_streams bigint;
  v_total_party_rooms bigint;
  v_total_coins_spent numeric;
  v_total_gifts_sent bigint;
  v_daily_active_users bigint;
  v_daily_active_hosts bigint;
  v_recent_activities jsonb;
BEGIN
  -- Caller MUST be an active admin (server-side header session OR auth.uid admin).
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT count(*) INTO v_total_users FROM profiles;
  SELECT count(*) INTO v_total_hosts FROM profiles WHERE is_host = true AND host_status = 'approved';
  SELECT count(*) INTO v_total_agencies FROM agencies;
  SELECT count(*) INTO v_total_streams FROM live_streams WHERE is_active = true;
  SELECT count(*) INTO v_total_party_rooms FROM party_rooms WHERE is_active = true;
  SELECT COALESCE(sum(coin_amount), 0) INTO v_total_coins_spent FROM gift_transactions;
  SELECT count(*) INTO v_total_gifts_sent FROM gift_transactions;
  SELECT count(*) INTO v_daily_active_users FROM profiles WHERE last_seen_at >= v_today;
  SELECT count(*) INTO v_daily_active_hosts FROM profiles WHERE is_host = true AND last_seen_at >= v_today;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_recent_activities
  FROM (
    SELECT id, action_type, admin_id, target_id, target_type, details, created_at
    FROM admin_logs
    ORDER BY created_at DESC
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'total_hosts', v_total_hosts,
    'total_agencies', v_total_agencies,
    'total_streams', v_total_streams,
    'total_party_rooms', v_total_party_rooms,
    'total_coins_spent', v_total_coins_spent,
    'total_gifts_sent', v_total_gifts_sent,
    'daily_active_users', v_daily_active_users,
    'daily_active_hosts', v_daily_active_hosts,
    'recent_activities', v_recent_activities
  );
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'Failed to load admin dashboard stats: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated, anon;
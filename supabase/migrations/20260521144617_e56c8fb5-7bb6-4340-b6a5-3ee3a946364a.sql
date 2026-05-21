CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'total_hosts', (SELECT COUNT(*) FROM public.profiles WHERE is_host = true),
    'total_agencies', (SELECT COUNT(*) FROM public.agencies),
    'active_streams', (
      SELECT COUNT(*)
      FROM public.live_streams
      WHERE COALESCE(is_active, false) = true
        AND ended_at IS NULL
        AND COALESCE(status, 'live') <> 'ended'
        AND COALESCE(last_heartbeat, started_at, created_at) >= now() - interval '90 seconds'
    ),
    'active_party_rooms', (SELECT COUNT(*) FROM public.party_rooms WHERE COALESCE(is_active, false) = true AND ended_at IS NULL),
    'total_gifts_today', (SELECT COALESCE(SUM(coin_amount), 0) FROM public.gift_transactions WHERE created_at >= CURRENT_DATE),
    'total_calls_today', (SELECT COUNT(*) FROM public.private_calls WHERE created_at >= CURRENT_DATE),
    'online_users', (SELECT COUNT(*) FROM public.profiles WHERE COALESCE(is_online, false) = true),
    'blocked_users', (SELECT COUNT(*) FROM public.blocked_users),
    'blocked_agencies', (SELECT COUNT(*) FROM public.agencies WHERE COALESCE(is_blocked, false) = true),
    'pending_host_applications', (SELECT COUNT(*) FROM public.face_verification_submissions WHERE status = 'pending' AND verification_type = 'host'),
    'daily_reward_claims_today', (SELECT COUNT(*) FROM public.vip_daily_rewards_log WHERE claimed_at >= CURRENT_DATE),
    'daily_recharges_today', (SELECT COUNT(*) FROM public.recharge_transactions WHERE created_at >= CURRENT_DATE),
    'daily_active_users', (SELECT COUNT(*) FROM public.profiles WHERE last_seen_at >= now() - interval '24 hours'),
    'daily_active_hosts', (SELECT COUNT(*) FROM public.profiles WHERE is_host = true AND last_seen_at >= now() - interval '24 hours'),
    'recent_activities', '[]'::jsonb
  ) INTO result;

  RETURN result;
END;
$function$;
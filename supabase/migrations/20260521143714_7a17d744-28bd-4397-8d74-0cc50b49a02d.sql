-- Live stream instant close/count sync hardening

INSERT INTO public.admin_broadcast (topic, version, updated_at)
VALUES ('live_streams', 0, now())
ON CONFLICT (topic) DO NOTHING;

DROP TRIGGER IF EXISTS tg_admin_broadcast_live_streams ON public.live_streams;
CREATE TRIGGER tg_admin_broadcast_live_streams
AFTER INSERT OR UPDATE OR DELETE ON public.live_streams
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('live_streams');

CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  UPDATE public.stream_viewers sv
  SET left_at = now()
  FROM public.live_streams ls
  WHERE sv.stream_id = ls.id
    AND sv.left_at IS NULL
    AND COALESCE(ls.is_active, false) = true
    AND COALESCE(ls.last_heartbeat, ls.started_at, ls.created_at) < now() - interval '90 seconds';

  UPDATE public.live_streams
  SET is_active = false,
      ended_at = COALESCE(ended_at, now()),
      status = 'ended',
      viewer_count = 0
  WHERE COALESCE(is_active, false) = true
    AND COALESCE(last_heartbeat, started_at, created_at) < now() - interval '90 seconds';

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stream_heartbeat(_stream_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.live_streams
  SET last_heartbeat = now(),
      status = CASE WHEN COALESCE(is_active, false) = true AND ended_at IS NULL THEN 'live' ELSE status END
  WHERE id = _stream_id
    AND is_active = true
    AND ended_at IS NULL
    AND host_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.end_live_stream(p_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_started timestamptz;
  v_is_active boolean;
  v_ended_existing timestamptz;
  v_ended timestamptz;
  v_duration int;
  v_audience int;
  v_total_coins bigint := 0;
  v_host_pct int;
  v_beans bigint := 0;
  v_total_diamonds bigint := 0;
  v_total_gifters int := 0;
  v_top jsonb := '[]'::jsonb;
  v_next jsonb;
  v_user_level int;
  v_max_level int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT started_at, is_active, ended_at
  INTO v_started, v_is_active, v_ended_existing
  FROM public.live_streams
  WHERE id = p_stream_id AND host_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stream not found or not your stream');
  END IF;

  v_ended := CASE
    WHEN v_is_active THEN now()
    ELSE coalesce(v_ended_existing, now())
  END;

  UPDATE public.stream_viewers
  SET left_at = coalesce(left_at, v_ended)
  WHERE stream_id = p_stream_id AND left_at IS NULL;

  UPDATE public.live_streams
  SET is_active = false,
      ended_at = coalesce(ended_at, v_ended),
      status = 'ended',
      viewer_count = 0
  WHERE id = p_stream_id AND host_id = uid;

  SELECT count(DISTINCT viewer_id)::int INTO v_audience
  FROM public.stream_viewers
  WHERE stream_id = p_stream_id;

  SELECT coalesce(sum(coin_amount), 0)::bigint INTO v_total_coins
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id AND receiver_id = uid;

  SELECT coalesce(sum(diamond_cost), 0)::bigint INTO v_total_diamonds
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id AND receiver_id = uid;

  SELECT count(DISTINCT sender_id)::int INTO v_total_gifters
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id
    AND receiver_id = uid
    AND sender_id IS NOT NULL;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'sender_id', s.sender_id,
          'total_coins', s.total_coins_spent,
          'display_name', s.display_name,
          'avatar_url', s.avatar_url
        )
        ORDER BY s.total_coins_spent DESC
      )
      FROM (
        SELECT
          gt.sender_id,
          sum(gt.coin_amount)::bigint AS total_coins_spent,
          max(pp.display_name) AS display_name,
          max(pp.avatar_url) AS avatar_url
        FROM public.gift_transactions gt
        LEFT JOIN public.profiles_public pp ON pp.id = gt.sender_id
        WHERE gt.stream_id = p_stream_id
          AND gt.receiver_id = uid
          AND gt.sender_id IS NOT NULL
        GROUP BY gt.sender_id
        ORDER BY sum(gt.coin_amount) DESC
        LIMIT 3
      ) s
    ),
    '[]'::jsonb
  ) INTO v_top;

  v_duration := GREATEST(0, EXTRACT(EPOCH FROM (v_ended - COALESCE(v_started, v_ended)))::int);

  SELECT COALESCE(public.get_effective_host_percent(uid), 0)::int INTO v_host_pct;
  v_beans := FLOOR(v_total_coins * COALESCE(v_host_pct, 0) / 100.0)::bigint;

  SELECT user_level, max_user_level INTO v_user_level, v_max_level
  FROM public.profiles
  WHERE id = uid;

  SELECT public.check_and_upgrade_user_level(uid) INTO v_next;

  RETURN jsonb_build_object(
    'success', true,
    'duration_seconds', v_duration,
    'audience_count', COALESCE(v_audience, 0),
    'total_coins', COALESCE(v_total_coins, 0),
    'total_diamonds', COALESCE(v_total_diamonds, 0),
    'total_gifters', COALESCE(v_total_gifters, 0),
    'host_percent', COALESCE(v_host_pct, 0),
    'beans_earned', COALESCE(v_beans, 0),
    'top_gifters', COALESCE(v_top, '[]'::jsonb),
    'level_result', COALESCE(v_next, '{}'::jsonb),
    'user_level', COALESCE(v_user_level, 1),
    'max_user_level', COALESCE(v_max_level, v_user_level, 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.end_live_stream(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_live_stream(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.end_live_stream(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_layout_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'online_users', (SELECT count(*) FROM public.profiles WHERE COALESCE(is_online, false) = true),
    'live_streams', (
      SELECT count(*)
      FROM public.live_streams
      WHERE COALESCE(is_active, false) = true
        AND ended_at IS NULL
        AND COALESCE(status, 'live') <> 'ended'
        AND COALESCE(last_heartbeat, started_at, created_at) >= now() - interval '90 seconds'
    ),
    'helper_upgrade_requests_pending', (SELECT count(*) FROM public.helper_upgrade_requests WHERE status = 'pending'),
    'helper_topup_requests_pending', (SELECT count(*) FROM public.helper_topup_requests WHERE status = 'pending'),
    'helper_applications_pending', (SELECT count(*) FROM public.helper_applications WHERE status = 'pending'),
    'host_applications_pending', (SELECT count(*) FROM public.face_verification_submissions WHERE status IN ('pending', 'submitted', 'under_review') AND verification_type = 'host'),
    'agency_withdrawals_pending', (SELECT count(*) FROM public.agency_withdrawals WHERE status IN ('pending', 'processing')),
    'helper_replies_unread', (SELECT count(*) FROM public.helper_message_replies WHERE sender_type = 'helper' AND COALESCE(is_read, false) = false),
    'support_tickets_live_open', (SELECT count(*) FROM public.support_tickets WHERE category = 'live_chat' AND status IN ('open', 'pending')),
    'face_verifications_pending', (SELECT count(*) FROM public.face_verification_submissions WHERE status IN ('pending', 'submitted', 'under_review') AND verification_type = 'face'),
    'user_reports_pending', (SELECT count(*) FROM public.user_reports WHERE status = 'pending'),
    'payroll_requests_pending', (SELECT count(*) FROM public.payroll_requests WHERE status = 'pending'),
    'helper_orders_pending', (SELECT count(*) FROM public.helper_orders WHERE status = 'pending'),
    'live_bans_active', (SELECT count(*) FROM public.live_bans WHERE COALESCE(is_active, false) = true),
    'live_face_violations_pending', (SELECT count(*) FROM public.live_face_violations WHERE status = 'pending'),
    'host_conversion_requests_pending', (SELECT count(*) FROM public.host_conversion_requests WHERE status = 'pending'),
    'chat_moderation_unreviewed', (SELECT count(*) FROM public.chat_moderation_logs WHERE reviewed_at IS NULL),
    'helper_withdrawal_requests_pending', (SELECT count(*) FROM public.helper_withdrawal_requests WHERE status = 'pending'),
    'rating_reward_claims_pending', (SELECT count(*) FROM public.rating_reward_claims WHERE status = 'pending'),
    'leaderboard_reward_history_pending', (SELECT count(*) FROM public.leaderboard_reward_history WHERE status = 'pending'),
    'consumption_return_unclaimed', (SELECT count(*) FROM public.consumption_return_history WHERE COALESCE(is_claimed, false) = false),
    'agency_earnings_transfers_pending', (SELECT count(*) FROM public.agency_earnings_transfers WHERE status = 'pending'),
    'coin_transfers_pending', (SELECT count(*) FROM public.coin_transfers WHERE status = 'pending')
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_layout_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_layout_counts() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    'daily_reward_claims_today', (SELECT COUNT(*) FROM public.daily_reward_claims WHERE created_at >= CURRENT_DATE),
    'daily_recharges_today', (SELECT COUNT(*) FROM public.recharge_transactions WHERE created_at >= CURRENT_DATE),
    'daily_active_users', (SELECT COUNT(*) FROM public.profiles WHERE last_seen_at >= now() - interval '24 hours'),
    'daily_active_hosts', (SELECT COUNT(*) FROM public.profiles WHERE is_host = true AND last_seen_at >= now() - interval '24 hours'),
    'recent_activities', '[]'::jsonb
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated, anon, service_role;

UPDATE public.stream_viewers sv
SET left_at = COALESCE(ls.ended_at, now())
FROM public.live_streams ls
WHERE sv.stream_id = ls.id
  AND sv.left_at IS NULL
  AND (COALESCE(ls.is_active, false) = false OR ls.ended_at IS NOT NULL OR COALESCE(ls.status, '') = 'ended');

UPDATE public.live_streams
SET status = 'ended',
    viewer_count = 0,
    ended_at = COALESCE(ended_at, now())
WHERE COALESCE(is_active, false) = false
  AND (ended_at IS NOT NULL OR COALESCE(status, '') <> 'ended' OR COALESCE(viewer_count, 0) <> 0);

SELECT public.cleanup_stale_live_streams();
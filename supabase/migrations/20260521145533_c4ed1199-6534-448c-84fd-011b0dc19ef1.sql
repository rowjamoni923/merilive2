-- Admin Dashboard 100% accurate counter + instant sync hardening

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  bd_day_start timestamptz;
  bd_day_end timestamptz;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  bd_day_start := timezone('Asia/Dhaka', date_trunc('day', timezone('Asia/Dhaka', now())));
  bd_day_end := bd_day_start + interval '1 day';

  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'total_hosts', (SELECT COUNT(*) FROM public.profiles WHERE COALESCE(is_host, false) = true),
    'total_agencies', (SELECT COUNT(*) FROM public.agencies),
    'active_streams', (
      SELECT COUNT(*)
      FROM public.live_streams
      WHERE COALESCE(is_active, false) = true
        AND ended_at IS NULL
        AND COALESCE(status, 'live') <> 'ended'
        AND COALESCE(last_heartbeat, started_at, created_at) >= now() - interval '90 seconds'
    ),
    'active_party_rooms', (
      SELECT COUNT(*)
      FROM public.party_rooms
      WHERE COALESCE(is_active, false) = true
        AND ended_at IS NULL
    ),
    'total_gifts_today', (
      SELECT COALESCE(SUM(coin_amount), 0)
      FROM public.gift_transactions
      WHERE created_at >= bd_day_start AND created_at < bd_day_end
    ),
    'total_calls_today', (
      SELECT COUNT(*)
      FROM public.private_calls
      WHERE created_at >= bd_day_start AND created_at < bd_day_end
    ),
    'online_users', (SELECT COUNT(*) FROM public.profiles WHERE COALESCE(is_online, false) = true),
    'blocked_users', (SELECT COUNT(*) FROM public.blocked_users),
    'blocked_agencies', (SELECT COUNT(*) FROM public.agencies WHERE COALESCE(is_blocked, false) = true),
    'pending_host_applications', (
      SELECT COUNT(*)
      FROM public.face_verification_submissions
      WHERE status IN ('pending', 'submitted', 'under_review')
        AND verification_type = 'host'
    ),
    'daily_reward_claims_today', (
      SELECT COUNT(*)
      FROM public.vip_daily_rewards_log
      WHERE claimed_at >= bd_day_start AND claimed_at < bd_day_end
    ),
    'daily_recharges_today', (
      SELECT
        (SELECT COUNT(*) FROM public.recharge_transactions WHERE created_at >= bd_day_start AND created_at < bd_day_end)
        + (SELECT COUNT(*) FROM public.payment_transactions WHERE created_at >= bd_day_start AND created_at < bd_day_end)
        + (SELECT COUNT(*) FROM public.coin_transactions WHERE created_at >= bd_day_start AND created_at < bd_day_end AND transaction_type IN ('recharge', 'self_recharge') AND COALESCE(status, '') = 'completed')
    ),
    'daily_active_users', (SELECT COUNT(*) FROM public.profiles WHERE last_seen_at >= now() - interval '24 hours'),
    'daily_active_hosts', (SELECT COUNT(*) FROM public.profiles WHERE COALESCE(is_host, false) = true AND last_seen_at >= now() - interval '24 hours'),
    'recent_activities', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'action_type', action,
          'target_type', table_name,
          'created_at', occurred_at
        ) ORDER BY occurred_at DESC
      )
      FROM (
        SELECT id, action, table_name, occurred_at
        FROM public.moderation_audit_log
        ORDER BY occurred_at DESC
        LIMIT 8
      ) recent
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$function$;

INSERT INTO public.admin_broadcast (topic, version, updated_at)
SELECT topic, 0, now()
FROM unnest(ARRAY[
  'party_rooms',
  'gift_transactions',
  'private_calls',
  'recharge_transactions',
  'payment_transactions',
  'coin_transactions',
  'vip_daily_rewards_log'
]) AS topic
ON CONFLICT (topic) DO NOTHING;

DROP TRIGGER IF EXISTS tg_admin_broadcast_party_rooms ON public.party_rooms;
CREATE TRIGGER tg_admin_broadcast_party_rooms
AFTER INSERT OR UPDATE OR DELETE ON public.party_rooms
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('party_rooms');

DROP TRIGGER IF EXISTS tg_admin_broadcast_gift_transactions ON public.gift_transactions;
CREATE TRIGGER tg_admin_broadcast_gift_transactions
AFTER INSERT OR UPDATE OR DELETE ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('gift_transactions');

DROP TRIGGER IF EXISTS tg_admin_broadcast_private_calls ON public.private_calls;
CREATE TRIGGER tg_admin_broadcast_private_calls
AFTER INSERT OR UPDATE OR DELETE ON public.private_calls
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('private_calls');

DROP TRIGGER IF EXISTS tg_admin_broadcast_coin_transactions ON public.coin_transactions;
CREATE TRIGGER tg_admin_broadcast_coin_transactions
AFTER INSERT OR UPDATE OR DELETE ON public.coin_transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('coin_transactions');

DROP TRIGGER IF EXISTS tg_admin_broadcast_vip_daily_rewards_log ON public.vip_daily_rewards_log;
CREATE TRIGGER tg_admin_broadcast_vip_daily_rewards_log
AFTER INSERT OR UPDATE OR DELETE ON public.vip_daily_rewards_log
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('vip_daily_rewards_log');
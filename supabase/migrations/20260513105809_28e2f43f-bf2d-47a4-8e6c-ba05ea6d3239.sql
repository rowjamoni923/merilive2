DO $$
DECLARE
  drop_tables text[] := ARRAY[
    'admin_allowed_devices','admin_notices','agency_diamond_transactions','agency_earnings_transfers','agency_hosts','agency_level_tiers','agency_performance','allowed_external_links','avatar_frames','chat_moderation_logs','coin_transactions','coin_transfers','entry_banners','entry_name_bars','feature_level_requirements','game_settings','helper_accepted_payment_methods','helper_admin_messages','helper_country_payment_methods','helper_level_config','helper_message_replies','helper_notifications','helper_orders','helper_payment_methods','helper_upgrade_requests','helper_withdrawal_requests','host_applications','invitation_reward_tiers','level_privileges','live_bans','live_game_bets','live_game_rounds','live_moderation_settings','new_host_live_bonus_progress','payment_gateways','payment_transactions','pk_battle_gifts','pk_battles','profiles','ranking_rewards','recharge_campaigns','stream_viewers','topup_helpers','topup_payment_methods','trader_level_tiers','user_level_tiers','user_parcels','user_purchases','user_role_frames','user_task_progress','vehicle_entrances','vip_tiers'
  ];
  keep_tables text[] := ARRAY[
    'app_settings','conversations','messages','notifications','private_calls','live_streams','party_rooms','party_room_participants','party_room_messages','stream_chat','gift_transactions','support_tickets','support_messages','face_verification_submissions','agencies','agency_withdrawals'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY drop_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY keep_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_online_status(
  p_user_id uuid,
  p_is_online boolean,
  p_last_seen_at timestamp with time zone DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles
  SET is_online = p_is_online,
      last_seen_at = p_last_seen_at
  WHERE id = p_user_id
    AND (
      COALESCE(is_online, false) IS DISTINCT FROM p_is_online
      OR last_seen_at IS NULL
      OR last_seen_at < (p_last_seen_at - interval '5 minutes')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_online_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.private_calls
  SET status = 'missed', ended_at = now(), end_reason = 'timeout'
  WHERE status = 'ringing'
    AND created_at < now() - interval '60 seconds';

  UPDATE public.private_calls
  SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status = 'connected'
    AND started_at < now() - interval '2 hours';

  UPDATE public.profiles
  SET is_in_call = false, current_call_id = NULL
  WHERE is_in_call = true
    AND id NOT IN (
      SELECT caller_id FROM public.private_calls WHERE status IN ('ringing', 'connected')
      UNION
      SELECT host_id FROM public.private_calls WHERE status IN ('ringing', 'connected')
    );

  UPDATE public.profiles
  SET is_online = false
  WHERE is_online = true
    AND last_seen_at < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_realtime_publication_status()
RETURNS TABLE(table_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tablename::text
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
  ORDER BY tablename;
$$;
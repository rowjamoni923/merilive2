-- Pkg345 Live/Party/Call moderation deep audit lockdown
-- Section #4 of Admin Panel A→Z roadmap (Pkg342-350).
-- ---------------------------------------------------------------
-- (A) RPC section-permission gates: admin_end_stream + admin_delete_recording
-- Both were gated only on is_admin_session(_admin_id) (any active sub-admin).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_end_stream(_admin_id uuid, _stream_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['streams','moderation','live-bans']::text[], true) THEN
    RAISE EXCEPTION 'forbidden_section';
  END IF;
  UPDATE public.live_streams
     SET status='ended', ended_at=COALESCE(ended_at, now())
   WHERE id=_stream_id;
END;$fn$;

CREATE OR REPLACE FUNCTION public.admin_delete_recording(_admin_id uuid, _recording_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_admin_session(_admin_id) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['recordings','streams']::text[], true) THEN
    RAISE EXCEPTION 'forbidden_section';
  END IF;
  DELETE FROM public.stream_recordings WHERE id=_recording_id;
END;$fn$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('admin_end_stream','admin_delete_recording')
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_end_stream('||r.args||') TO anon, authenticated, service_role';
  END LOOP;
END$$;

-- ---------------------------------------------------------------
-- (B) Drop "Admin session full access" catch-all + legacy duplicates on every
--     live/party/call/pk/game/livekit table.
-- ---------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN (
        -- logs/audit (becoming SELECT-only)
        'call_delivery_log','call_events','call_e2ee_keys','private_call_security_logs',
        'private_calls',
        'livekit_agent_ops_log','livekit_egress_ops_log','livekit_ingress_ops_log',
        'livekit_moderation_log','livekit_room_ops_log','livekit_sip_ops_log',
        'livekit_participant_forwards','livekit_participant_moves','livekit_permission_updates',
        'live_face_violations','live_face_warnings','live_violations',
        'live_game_bets','live_game_rounds',
        'game_bets','game_players','game_provider_logs','game_session_tokens',
        'game_sessions','game_stats','game_transactions',
        'stream_chat','stream_viewers','stream_simulcasts',
        'party_room_messages','party_room_participants',
        'pk_battles','pk_participants','pk_reward_history',
        'new_host_live_bonus_progress',
        -- catalog/config (split into select + write)
        'live_streams','live_moderation_settings','live_bans',
        'party_rooms','party_room_banners',
        'pk_competitions','pk_competition_rewards','pk_reward_banners',
        'stream_recordings',
        'game_configs','game_providers','game_settings','game_server_settings','provider_games',
        'new_host_live_bonus_settings'
      )
      AND policyname IN (
        'Admin session full access',
        'Admin session manages e2ee keys',
        'Admin session full access stream_simulcasts',
        'lk_perm_updates_admin_all',
        'live_face_warnings_admin_all',
        'live_categories_admin_all',
        'Admins can delete any stream',
        'Admins can update any stream',
        'Admins can update face violations',
        'Admins manage live_bans',
        'Admin full access game_configs',
        'Admins can manage game providers',
        'Admins full access to game providers',
        'Admins full access to game server settings',
        'Admins can manage provider logs',
        'Admins manage game provider logs',
        'Admin view all game transactions'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END$$;

-- ---------------------------------------------------------------
-- (C) Audit/log tables: SELECT-only for any active admin.
-- No admin DML — only service_role (cron/edge fn/trigger) may insert/update/delete.
-- ---------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'call_delivery_log','call_events','call_e2ee_keys','private_call_security_logs',
    'private_calls',
    'livekit_agent_ops_log','livekit_egress_ops_log','livekit_ingress_ops_log',
    'livekit_moderation_log','livekit_room_ops_log','livekit_sip_ops_log',
    'livekit_participant_forwards','livekit_participant_moves','livekit_permission_updates',
    'live_face_violations','live_face_warnings','live_violations',
    'live_game_bets','live_game_rounds',
    'game_bets','game_players','game_provider_logs','game_session_tokens',
    'game_sessions','game_stats','game_transactions',
    'stream_chat','stream_viewers','stream_simulcasts',
    'party_room_messages','party_room_participants',
    'pk_battles','pk_participants','pk_reward_history',
    'new_host_live_bonus_progress'
  ])
  LOOP
    EXECUTE format(
      'CREATE POLICY pkg345_%I_admin_select ON public.%I FOR SELECT TO anon, authenticated USING (public.is_active_admin_session())',
      t, t);
  END LOOP;
END$$;

-- ---------------------------------------------------------------
-- (D) Catalog/config tables: SELECT any admin + WRITE section-gated.
-- ---------------------------------------------------------------
-- live_streams (admin moderation: end stream / soft-delete) → streams/moderation
CREATE POLICY pkg345_live_streams_admin_select ON public.live_streams
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_live_streams_admin_write ON public.live_streams
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['streams','moderation','live-bans']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['streams','moderation','live-bans']::text[], true));

-- live_moderation_settings → moderation
CREATE POLICY pkg345_live_moderation_settings_admin_select ON public.live_moderation_settings
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_live_moderation_settings_admin_write ON public.live_moderation_settings
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['moderation','streams']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['moderation','streams']::text[], true));

-- live_bans → live-bans/moderation/user-management
CREATE POLICY pkg345_live_bans_admin_select ON public.live_bans
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_live_bans_admin_write ON public.live_bans
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['live-bans','moderation','user-management']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['live-bans','moderation','user-management']::text[], true));

-- party_rooms → party-rooms/moderation
CREATE POLICY pkg345_party_rooms_admin_select ON public.party_rooms
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_party_rooms_admin_write ON public.party_rooms
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['party-rooms','moderation']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['party-rooms','moderation']::text[], true));

-- party_room_banners → party-banners
CREATE POLICY pkg345_party_room_banners_admin_select ON public.party_room_banners
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_party_room_banners_admin_write ON public.party_room_banners
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['party-banners','party-rooms','banners']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['party-banners','party-rooms','banners']::text[], true));

-- pk_competitions → streams
CREATE POLICY pkg345_pk_competitions_admin_select ON public.pk_competitions
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_pk_competitions_admin_write ON public.pk_competitions
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['streams','moderation']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['streams','moderation']::text[], true));

-- pk_competition_rewards → streams
CREATE POLICY pkg345_pk_competition_rewards_admin_select ON public.pk_competition_rewards
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_pk_competition_rewards_admin_write ON public.pk_competition_rewards
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['streams','moderation']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['streams','moderation']::text[], true));

-- pk_reward_banners → streams/banners
CREATE POLICY pkg345_pk_reward_banners_admin_select ON public.pk_reward_banners
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_pk_reward_banners_admin_write ON public.pk_reward_banners
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['streams','banners','moderation']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['streams','banners','moderation']::text[], true));

-- stream_recordings → recordings/streams
CREATE POLICY pkg345_stream_recordings_admin_select ON public.stream_recordings
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_stream_recordings_admin_write ON public.stream_recordings
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['recordings','streams']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['recordings','streams']::text[], true));

-- game_configs → game-settings/game-hub
CREATE POLICY pkg345_game_configs_admin_select ON public.game_configs
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_game_configs_admin_write ON public.game_configs
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['game-settings','game-hub','game-providers']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['game-settings','game-hub','game-providers']::text[], true));

-- game_providers → game-providers/game-hub
CREATE POLICY pkg345_game_providers_admin_select ON public.game_providers
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_game_providers_admin_write ON public.game_providers
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['game-providers','game-hub','game-settings']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['game-providers','game-hub','game-settings']::text[], true));

-- game_settings → game-settings/game-hub
CREATE POLICY pkg345_game_settings_admin_select ON public.game_settings
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_game_settings_admin_write ON public.game_settings
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['game-settings','game-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['game-settings','game-hub']::text[], true));

-- game_server_settings → game-settings/game-hub
CREATE POLICY pkg345_game_server_settings_admin_select ON public.game_server_settings
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_game_server_settings_admin_write ON public.game_server_settings
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['game-settings','game-hub','game-providers']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['game-settings','game-hub','game-providers']::text[], true));

-- provider_games → game-providers/game-hub
CREATE POLICY pkg345_provider_games_admin_select ON public.provider_games
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_provider_games_admin_write ON public.provider_games
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['game-providers','game-hub','game-settings']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['game-providers','game-hub','game-settings']::text[], true));

-- new_host_live_bonus_settings (host bonus catalog → defer to Pkg346 logic but lock now)
CREATE POLICY pkg345_new_host_live_bonus_settings_admin_select ON public.new_host_live_bonus_settings
  FOR SELECT TO anon, authenticated USING (public.is_active_admin_session());
CREATE POLICY pkg345_new_host_live_bonus_settings_admin_write ON public.new_host_live_bonus_settings
  FOR ALL TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['streams','moderation','host-management']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['streams','moderation','host-management']::text[], true));
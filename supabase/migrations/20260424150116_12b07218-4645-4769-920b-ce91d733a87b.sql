
-- =====================================================================
-- ADMIN SERVER-SIDE SESSION + RLS UNLOCK FOR WRITES
-- =====================================================================

-- 1) Header reader: returns the x-admin-token header value (lowercased)
CREATE OR REPLACE FUNCTION public.current_admin_token_from_header()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers jsonb;
  v_token text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;
  v_token := v_headers->>'x-admin-token';
  IF v_token IS NULL OR length(v_token) < 16 THEN
    RETURN NULL;
  END IF;
  RETURN v_token;
END;
$$;

-- 2) Resolve token -> active admin id
CREATE OR REPLACE FUNCTION public.current_admin_id_from_header()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_admin_id uuid;
BEGIN
  v_token := public.current_admin_token_from_header();
  IF v_token IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT au.id
    INTO v_admin_id
  FROM public.admin_sessions s
  JOIN public.admin_users au ON au.id = s.admin_user_id
  WHERE s.session_token = v_token
    AND s.expires_at > now()
    AND au.is_active = true
  LIMIT 1;
  RETURN v_admin_id;
END;
$$;

-- 3) Boolean wrapper for RLS
CREATE OR REPLACE FUNCTION public.is_active_admin_session()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_admin_id_from_header() IS NOT NULL;
$$;

-- 4) Update admin_authenticate to issue a real session token
CREATE OR REPLACE FUNCTION public.admin_authenticate(_email text, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin record;
  v_password_valid boolean := false;
  v_token text;
BEGIN
  SELECT id, email, display_name, role, is_active, password_hash, must_change_password
    INTO v_admin
  FROM public.admin_users
  WHERE LOWER(email) = LOWER(_email)
    AND is_active = true
  LIMIT 1;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  IF v_admin.password_hash IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password not set. Contact owner.');
  END IF;

  v_password_valid := (v_admin.password_hash = extensions.crypt(_password, v_admin.password_hash));

  IF NOT v_password_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid credentials');
  END IF;

  -- Create a fresh server-side session (24h)
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.admin_sessions (admin_user_id, session_token, expires_at)
  VALUES (v_admin.id, v_token, now() + interval '7 days');

  UPDATE public.admin_users
  SET last_login_at = now()
  WHERE id = v_admin.id;

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', v_admin.id,
    'email', v_admin.email,
    'display_name', v_admin.display_name,
    'role', v_admin.role,
    'must_change_password', COALESCE(v_admin.must_change_password, false),
    'is_owner', (v_admin.role = 'owner'),
    'session_token', v_token
  );
END;
$$;

-- 5) Logout RPC
CREATE OR REPLACE FUNCTION public.admin_logout(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.admin_sessions WHERE session_token = _token;
$$;

GRANT EXECUTE ON FUNCTION public.admin_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_admin_session() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_admin_id_from_header() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_admin_token_from_header() TO anon, authenticated;

-- 6) Apply uniform "Admin session full access" policy to every admin-managed table
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'admin_allowed_devices','admin_logs','admin_notices','admin_notifications',
    'admin_section_permissions','admin_sections','admin_users','admin_owner_whitelist',
    'admin_music_library','admin_invitations','admin_login_otps','admin_access_tokens',
    'admin_permanent_ban_cases','admin_permanent_ban_case_targets',
    'agencies','agency_earnings_transfers','agency_hosts','agency_level_tiers',
    'agency_performance','agency_policy_settings','agency_withdrawals',
    'agency_commission_history','agency_diamond_transactions','agency_rankings',
    'agency_withdrawal_locks',
    'allowed_external_links','animations','app_content','app_event_themes',
    'app_icon_registry','app_settings','app_version_settings','ar_stickers','assets',
    'avatar_frames','avatars',
    'banned_devices','banned_face_hashes','banned_ips','banners',
    'branding','branding_settings',
    'chat_moderation_logs','coin_packages','coin_transfers',
    'consumption_return_config','currency_rates',
    'daily_login_rewards_config','daily_tasks','device_tokens',
    'entry_banners','entry_name_bars',
    'face_verification_submissions','feature_level_requirements','first_recharge_bonus',
    'followers','frames',
    'game_providers','game_rounds_stats','game_server_settings','game_settings',
    'game_stats','game_transactions','gift_transactions','gifts',
    'helper_admin_messages','helper_applications','helper_country_payment_methods',
    'helper_diamond_packages','helper_level_config','helper_message_replies',
    'helper_notifications','helper_orders','helper_topup_requests',
    'helper_transactions','helper_upgrade_requests','helper_withdrawal_requests',
    'host_applications','host_contact_violations','host_conversion_requests',
    'invitation_reward_tiers','invitation_settings',
    'landing_page_sections','leaderboard_podium_frames','leaderboard_reward_config',
    'leaderboard_reward_history','level_animations','level_privileges',
    'limited_time_offers','live_bans','live_game_rounds','live_moderation_settings',
    'live_streams',
    'notification_templates','notifications','onboarding_slides',
    'parcel_claims','parcel_templates',
    'party_room_backgrounds','party_room_banners','party_room_participants','party_rooms',
    'payment_gateways','payment_transactions','payroll_requests',
    'pk_competition_rewards','pk_competitions','popup_event_banners','private_calls',
    'profiles',
    'ranking_rewards','rating_reward_claims','recharge_campaigns','recharge_transactions',
    'reel_categories','reel_reports','reels','role_frames','room_welcome_messages',
    'shop_items','sounds','stream_recordings','stream_viewers',
    'support_messages','support_tickets','system_error_logs',
    'topup_helpers','topup_payment_methods','trader_level_tiers',
    'user_beans_exchange_tiers','user_level_tiers','user_parcels',
    'user_role_frames','user_task_progress','violation_penalty_tiers','vip_tiers',
    'account_lockouts','admin_stats','balance_audit_log','admin_sessions'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    -- Skip tables that don't exist yet
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename = v_table
    ) THEN
      CONTINUE;
    END IF;

    -- Drop any prior incarnation of our policy so re-runs are idempotent
    EXECUTE format('DROP POLICY IF EXISTS "Admin session full access" ON public.%I', v_table);

    -- Recreate
    EXECUTE format($f$
      CREATE POLICY "Admin session full access"
      ON public.%I
      AS PERMISSIVE
      FOR ALL
      TO anon, authenticated
      USING (public.is_active_admin_session())
      WITH CHECK (public.is_active_admin_session())
    $f$, v_table);
  END LOOP;
END $$;

-- 7) Whitelist admin session inside the profile-protection trigger
-- so admin updates to is_host / host_status / balances pass through.
CREATE OR REPLACE FUNCTION public.check_profile_update_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip when running in a privileged context
  IF current_setting('app.bypass_profile_protection', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Allow when an active admin session is present (admin panel writes)
  IF public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  -- Allow internal automatic transitions (face-verification host promotion etc)
  IF TG_OP = 'UPDATE' AND OLD.id = NEW.id THEN
    -- Female face-verification auto-promotion
    IF OLD.is_face_verified IS DISTINCT FROM NEW.is_face_verified THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Block sensitive column changes for non-admins
  IF TG_OP = 'UPDATE' THEN
    IF NEW.diamonds        IS DISTINCT FROM OLD.diamonds
    OR NEW.beans           IS DISTINCT FROM OLD.beans
    OR NEW.coins           IS DISTINCT FROM OLD.coins
    OR NEW.is_host         IS DISTINCT FROM OLD.is_host
    OR NEW.host_status     IS DISTINCT FROM OLD.host_status
    OR NEW.role            IS DISTINCT FROM OLD.role
    OR NEW.level           IS DISTINCT FROM OLD.level
    OR NEW.total_recharged IS DISTINCT FROM OLD.total_recharged
    THEN
      IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'profile sensitive field change not allowed';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

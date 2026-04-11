CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = _user_id
      AND is_active = true
  );
$$;

ALTER TABLE public.avatar_frames
  ADD COLUMN IF NOT EXISTS frame_url text,
  ADD COLUMN IF NOT EXISTS frame_type text,
  ADD COLUMN IF NOT EXISTS animation_type text,
  ADD COLUMN IF NOT EXISTS min_level integer,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS sound_url text,
  ADD COLUMN IF NOT EXISTS sound_duration_ms integer,
  ADD COLUMN IF NOT EXISTS target_type text;

ALTER TABLE public.avatar_frames
  ALTER COLUMN min_level SET DEFAULT 1,
  ALTER COLUMN sound_duration_ms SET DEFAULT 3000,
  ALTER COLUMN target_type SET DEFAULT 'both';

UPDATE public.avatar_frames
SET
  frame_url = COALESCE(NULLIF(frame_url, ''), NULLIF(animation_url, ''), NULLIF(image_url, '')),
  image_url = COALESCE(NULLIF(image_url, ''), NULLIF(frame_url, ''), NULLIF(animation_url, '')),
  min_level = COALESCE(min_level, level_required, 1),
  level_required = COALESCE(level_required, min_level, 1),
  frame_type = COALESCE(
    NULLIF(frame_type, ''),
    CASE
      WHEN lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.svga%' THEN 'svga'
      WHEN lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.json%' THEN 'lottie'
      WHEN lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.gif%' THEN 'gif'
      WHEN lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.webp%' THEN 'webp'
      WHEN lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.mp4%' THEN 'mp4'
      WHEN lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.webm%' THEN 'webm'
      ELSE 'png'
    END
  ),
  animation_type = COALESCE(
    NULLIF(animation_type, ''),
    CASE
      WHEN lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.svga%'
        OR lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.json%'
        OR lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.gif%'
        OR lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.webp%'
        OR lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.mp4%'
        OR lower(COALESCE(frame_url, animation_url, image_url, '')) LIKE '%.webm%'
      THEN 'animated'
      ELSE 'static'
    END
  ),
  target_type = COALESCE(NULLIF(target_type, ''), 'both'),
  sound_duration_ms = COALESCE(sound_duration_ms, 3000),
  updated_at = COALESCE(updated_at, now());

CREATE OR REPLACE FUNCTION public.sync_avatar_frame_compatibility()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.frame_url := COALESCE(NULLIF(NEW.frame_url, ''), NULLIF(NEW.animation_url, ''), NULLIF(NEW.image_url, ''));
  NEW.image_url := COALESCE(NULLIF(NEW.image_url, ''), NEW.frame_url, NULLIF(NEW.animation_url, ''));

  IF NEW.frame_type IS NULL OR btrim(NEW.frame_type) = '' THEN
    NEW.frame_type := CASE
      WHEN lower(COALESCE(NEW.frame_url, NEW.animation_url, NEW.image_url, '')) LIKE '%.svga%' THEN 'svga'
      WHEN lower(COALESCE(NEW.frame_url, NEW.animation_url, NEW.image_url, '')) LIKE '%.json%' THEN 'lottie'
      WHEN lower(COALESCE(NEW.frame_url, NEW.animation_url, NEW.image_url, '')) LIKE '%.gif%' THEN 'gif'
      WHEN lower(COALESCE(NEW.frame_url, NEW.animation_url, NEW.image_url, '')) LIKE '%.webp%' THEN 'webp'
      WHEN lower(COALESCE(NEW.frame_url, NEW.animation_url, NEW.image_url, '')) LIKE '%.mp4%' THEN 'mp4'
      WHEN lower(COALESCE(NEW.frame_url, NEW.animation_url, NEW.image_url, '')) LIKE '%.webm%' THEN 'webm'
      ELSE 'png'
    END;
  END IF;

  IF NEW.animation_type IS NULL OR btrim(NEW.animation_type) = '' THEN
    NEW.animation_type := CASE
      WHEN NEW.frame_type IN ('svga', 'lottie', 'gif', 'webp', 'mp4', 'webm') THEN 'animated'
      ELSE 'static'
    END;
  END IF;

  NEW.min_level := COALESCE(NEW.min_level, NEW.level_required, 1);
  NEW.level_required := COALESCE(NEW.level_required, NEW.min_level, 1);
  NEW.target_type := COALESCE(NULLIF(NEW.target_type, ''), 'both');
  NEW.sound_duration_ms := COALESCE(NEW.sound_duration_ms, 3000);
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_avatar_frame_compatibility_trigger ON public.avatar_frames;
CREATE TRIGGER sync_avatar_frame_compatibility_trigger
BEFORE INSERT OR UPDATE ON public.avatar_frames
FOR EACH ROW
EXECUTE FUNCTION public.sync_avatar_frame_compatibility();

DO $$
DECLARE
  _table text;
  _tables text[] := ARRAY[
    'admin_allowed_devices','admin_logs','admin_notices','admin_section_permissions','admin_sections','admin_users',
    'agencies','agency_earnings_transfers','agency_hosts','agency_level_tiers','agency_performance','agency_policy_settings','agency_withdrawals',
    'allowed_external_links','app_content','app_event_themes','app_icon_registry','app_settings','app_version_settings',
    'ar_stickers','avatar_frames','banners','beauty_filters','branding_settings','chat_bubbles','chat_moderation_logs','coin_packages','coin_transfers',
    'consumption_return_config','consumption_return_history','currency_rates','daily_login_rewards_config','entry_banners','entry_name_bars',
    'face_verification_submissions','feature_level_requirements','first_recharge_bonus','game_providers','game_rounds_stats','game_server_settings',
    'game_settings','game_stats','game_transactions','gift_transactions','gifts','helper_applications','helper_country_payment_methods',
    'helper_diamond_packages','helper_level_config','helper_message_replies','helper_notifications','helper_orders','helper_topup_requests',
    'helper_transactions','helper_upgrade_requests','helper_withdrawal_requests','host_applications','host_contact_violations',
    'host_conversion_requests','invitation_settings','landing_page_sections','leaderboard_podium_frames','leaderboard_reward_config',
    'leaderboard_reward_history','level_animations','level_privileges','limited_time_offers','live_bans','live_face_violations',
    'live_game_rounds','live_moderation_settings','live_streams','live_violations','new_host_live_bonus_settings','notification_templates',
    'notifications','parcel_claims','parcel_templates','party_room_backgrounds','party_room_banners','party_room_participants','party_rooms',
    'payment_gateways','payment_transactions','payroll_requests','popup_event_banners','private_calls','profiles','ranking_rewards',
    'rating_reward_claims','recharge_transactions','reel_categories','reel_reports','reels','role_frames','room_welcome_messages','shop_items',
    'stream_recordings','stream_viewers','support_messages','support_tickets','system_error_logs','topup_helpers','topup_payment_methods',
    'trader_level_tiers','user_beans_exchange_tiers','user_level_tiers','user_parcels','user_reports','user_role_frames','user_roles',
    'user_task_progress','vehicle_entrances','violation_penalty_tiers','vip_tiers'
  ];
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = _table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'admin_manage_v2', _table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))',
        'admin_manage_v2',
        _table
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='avatar_frames') THEN
    DROP POLICY IF EXISTS public_read_active_avatar_frames_v2 ON public.avatar_frames;
    CREATE POLICY public_read_active_avatar_frames_v2
    ON public.avatar_frames
    FOR SELECT
    TO public
    USING (COALESCE(is_active, true) = true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='banners') THEN
    DROP POLICY IF EXISTS public_read_active_banners_v2 ON public.banners;
    CREATE POLICY public_read_active_banners_v2
    ON public.banners
    FOR SELECT
    TO public
    USING (
      COALESCE(is_active, true) = true
      AND (start_date IS NULL OR start_date <= now())
      AND (end_date IS NULL OR end_date >= now())
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='branding_settings') THEN
    DROP POLICY IF EXISTS public_read_default_branding_v2 ON public.branding_settings;
    CREATE POLICY public_read_default_branding_v2
    ON public.branding_settings
    FOR SELECT
    TO public
    USING (setting_key = 'default');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='coin_packages') THEN
    DROP POLICY IF EXISTS public_read_active_coin_packages_v2 ON public.coin_packages;
    CREATE POLICY public_read_active_coin_packages_v2
    ON public.coin_packages
    FOR SELECT
    TO public
    USING (COALESCE(is_active, true) = true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='currency_rates') THEN
    DROP POLICY IF EXISTS public_read_active_currency_rates_v2 ON public.currency_rates;
    CREATE POLICY public_read_active_currency_rates_v2
    ON public.currency_rates
    FOR SELECT
    TO public
    USING (COALESCE(is_active, true) = true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='daily_login_rewards_config') THEN
    DROP POLICY IF EXISTS public_read_active_daily_rewards_v2 ON public.daily_login_rewards_config;
    CREATE POLICY public_read_active_daily_rewards_v2
    ON public.daily_login_rewards_config
    FOR SELECT
    TO public
    USING (COALESCE(is_active, true) = true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='first_recharge_bonus') THEN
    DROP POLICY IF EXISTS public_read_active_first_recharge_bonus_v2 ON public.first_recharge_bonus;
    CREATE POLICY public_read_active_first_recharge_bonus_v2
    ON public.first_recharge_bonus
    FOR SELECT
    TO public
    USING (COALESCE(is_active, true) = true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='game_settings') THEN
    DROP POLICY IF EXISTS public_read_active_game_settings_v2 ON public.game_settings;
    CREATE POLICY public_read_active_game_settings_v2
    ON public.game_settings
    FOR SELECT
    TO public
    USING (COALESCE(is_active, true) = true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gifts') THEN
    DROP POLICY IF EXISTS public_read_active_gifts_v2 ON public.gifts;
    CREATE POLICY public_read_active_gifts_v2
    ON public.gifts
    FOR SELECT
    TO public
    USING (COALESCE(is_active, true) = true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='popup_event_banners') THEN
    DROP POLICY IF EXISTS public_read_active_popup_event_banners_v2 ON public.popup_event_banners;
    CREATE POLICY public_read_active_popup_event_banners_v2
    ON public.popup_event_banners
    FOR SELECT
    TO public
    USING (
      COALESCE(is_active, true) = true
      AND (start_date IS NULL OR start_date <= now())
      AND (end_date IS NULL OR end_date >= now())
    );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='topup_payment_methods') THEN
    DROP POLICY IF EXISTS public_read_active_topup_payment_methods_v2 ON public.topup_payment_methods;
    CREATE POLICY public_read_active_topup_payment_methods_v2
    ON public.topup_payment_methods
    FOR SELECT
    TO public
    USING (COALESCE(is_active, true) = true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='avatar_frames')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime'
        AND n.nspname = 'public'
        AND c.relname = 'avatar_frames'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.avatar_frames;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='banners')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'banners'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.banners;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='branding_settings')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'branding_settings'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branding_settings;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='coin_packages')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'coin_packages'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.coin_packages;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='currency_rates')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'currency_rates'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.currency_rates;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='daily_login_rewards_config')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'daily_login_rewards_config'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_login_rewards_config;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='first_recharge_bonus')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'first_recharge_bonus'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.first_recharge_bonus;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='gifts')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'gifts'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gifts;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='popup_event_banners')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'popup_event_banners'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.popup_event_banners;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='topup_payment_methods')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid = pr.prrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_publication p ON p.oid = pr.prpubid
      WHERE p.pubname = 'supabase_realtime' AND n.nspname = 'public' AND c.relname = 'topup_payment_methods'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.topup_payment_methods;
  END IF;
END;
$$;
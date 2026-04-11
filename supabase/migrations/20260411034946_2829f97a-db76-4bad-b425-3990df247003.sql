
-- =============================================
-- 1. Fix is_admin() to support email-based fallback
--    (legacy admins whose user_id is not yet linked)
-- =============================================
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
    WHERE (user_id = _user_id OR email = (SELECT email FROM auth.users WHERE id = _user_id))
      AND is_active = true
  );
$$;

-- Also keep the no-arg version in sync
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(auth.uid());
$$;

-- =============================================
-- 2. Add admin_manage_v3 policy to 10 missing tables
-- =============================================
DO $$
DECLARE
  _table text;
  _tables text[] := ARRAY[
    'animations','branding','daily_tasks','device_tokens','followers',
    'frames','helper_admin_messages','onboarding_slides',
    'pk_competition_rewards','pk_competitions'
  ];
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = _table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
      EXECUTE format('DROP POLICY IF EXISTS admin_manage_v3 ON public.%I', _table);
      EXECUTE format(
        'CREATE POLICY admin_manage_v3 ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))',
        _table
      );
    END IF;
  END LOOP;
END;
$$;

-- =============================================
-- 3. Add missing tables to supabase_realtime publication
-- =============================================
DO $$
DECLARE
  _table text;
  _rt_tables text[] := ARRAY[
    'invitation_settings','payment_gateways','payment_transactions',
    'onboarding_slides','pk_competitions','pk_competition_rewards',
    'helper_admin_messages','daily_tasks','device_tokens',
    'shop_items','ranking_rewards','feature_level_requirements',
    'game_providers','notification_templates','popup_event_banners',
    'entry_name_bars','role_frames','trader_level_tiers',
    'user_beans_exchange_tiers','violation_penalty_tiers',
    'helper_diamond_packages','helper_level_config',
    'leaderboard_reward_config','leaderboard_podium_frames',
    'party_room_backgrounds','party_room_banners',
    'landing_page_sections','allowed_external_links',
    'app_event_themes','app_icon_registry'
  ];
BEGIN
  FOREACH _table IN ARRAY _rt_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = _table
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = _table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _table);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- =============================================
-- 4. Set REPLICA IDENTITY FULL for admin config tables
--    (needed for complete realtime data in UPDATE events)
-- =============================================
DO $$
DECLARE
  _table text;
  _ri_tables text[] := ARRAY[
    'invitation_settings','payment_gateways','onboarding_slides',
    'pk_competitions','pk_competition_rewards','helper_admin_messages',
    'shop_items','ranking_rewards','feature_level_requirements',
    'notification_templates','popup_event_banners','entry_name_bars',
    'role_frames','helper_diamond_packages','helper_level_config',
    'party_room_backgrounds','party_room_banners',
    'landing_page_sections','allowed_external_links',
    'app_event_themes','app_icon_registry'
  ];
BEGIN
  FOREACH _table IN ARRAY _ri_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = _table
    ) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', _table);
    END IF;
  END LOOP;
END;
$$;

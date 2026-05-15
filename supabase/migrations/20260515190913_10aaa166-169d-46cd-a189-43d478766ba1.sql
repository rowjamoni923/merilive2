
-- ============================================================
-- Admin → App Instant Sync (Pkg36)
-- ONE broadcast table users subscribe to. Triggers on every
-- admin-managed table bump a single row → end-user app (web +
-- native Capacitor) gets <1s push for any admin change.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_broadcast (
  topic text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 1,
  last_event text,
  last_row_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_broadcast REPLICA IDENTITY FULL;
ALTER TABLE public.admin_broadcast ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read admin_broadcast" ON public.admin_broadcast;
CREATE POLICY "Anyone can read admin_broadcast"
  ON public.admin_broadcast FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin session manages admin_broadcast" ON public.admin_broadcast;
CREATE POLICY "Admin session manages admin_broadcast"
  ON public.admin_broadcast FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='admin_broadcast'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_broadcast';
  END IF;
END $$;

-- Generic trigger function: TG_ARGV[0] = topic name (defaults to TG_TABLE_NAME)
CREATE OR REPLACE FUNCTION public.tg_admin_broadcast_bump()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topic text := COALESCE(TG_ARGV[0], TG_TABLE_NAME);
  v_row_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row_id := COALESCE((to_jsonb(OLD)->>'id'), (to_jsonb(OLD)->>'setting_key'), '');
  ELSE
    v_row_id := COALESCE((to_jsonb(NEW)->>'id'), (to_jsonb(NEW)->>'setting_key'), '');
  END IF;

  INSERT INTO public.admin_broadcast (topic, version, last_event, last_row_id, updated_at)
  VALUES (v_topic, 1, TG_OP, v_row_id, now())
  ON CONFLICT (topic) DO UPDATE
    SET version = admin_broadcast.version + 1,
        last_event = EXCLUDED.last_event,
        last_row_id = EXCLUDED.last_row_id,
        updated_at = now();

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Helper: attach trigger to a table (idempotent)
CREATE OR REPLACE FUNCTION public.__attach_admin_broadcast(_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_trigger text := 'tg_admin_broadcast_' || _table;
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_trigger, _table);
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
     FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump(%L)',
    v_trigger, _table, _table
  );
END;
$$;

-- Attach to all 47 admin-managed tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'banners','popup_event_banners','rating_banners','onboarding_slides','app_content','landing_page_sections',
    'gifts','avatar_frames','role_frames','chat_bubbles','entry_effects','entry_banners','beauty_filters','ar_stickers',
    'coin_packages','currency_rates','topup_payment_methods','branding_settings','app_settings','app_version_settings',
    'vip_tiers','level_privileges','level_animations','user_level_tiers','feature_level_requirements',
    'game_settings','game_providers','game_server_settings',
    'daily_tasks','ranking_rewards','daily_login_rewards_config','first_recharge_bonus','consumption_return_config',
    'limited_time_offers','new_host_live_bonus_settings',
    'leaderboard_reward_config','leaderboard_podium_frames',
    'parcel_templates','helper_level_config','user_beans_exchange_tiers','agency_level_tiers',
    'invitation_settings','invitation_reward_tiers','allowed_external_links',
    'violation_penalty_tiers','notification_templates','admin_notices','shop_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    PERFORM public.__attach_admin_broadcast(t);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.__attach_admin_broadcast(text);

-- Seed initial rows so subscribers have stable topic list
INSERT INTO public.admin_broadcast (topic, version)
SELECT unnest(ARRAY[
  'banners','popup_event_banners','rating_banners','onboarding_slides','app_content','landing_page_sections',
  'gifts','avatar_frames','role_frames','chat_bubbles','entry_effects','entry_banners','beauty_filters','ar_stickers',
  'coin_packages','currency_rates','topup_payment_methods','branding_settings','app_settings','app_version_settings',
  'vip_tiers','level_privileges','level_animations','user_level_tiers','feature_level_requirements',
  'game_settings','game_providers','game_server_settings',
  'daily_tasks','ranking_rewards','daily_login_rewards_config','first_recharge_bonus','consumption_return_config',
  'limited_time_offers','new_host_live_bonus_settings',
  'leaderboard_reward_config','leaderboard_podium_frames',
  'parcel_templates','helper_level_config','user_beans_exchange_tiers','agency_level_tiers',
  'invitation_settings','invitation_reward_tiers','allowed_external_links',
  'violation_penalty_tiers','notification_templates','admin_notices','shop_items'
]), 0
ON CONFLICT (topic) DO NOTHING;

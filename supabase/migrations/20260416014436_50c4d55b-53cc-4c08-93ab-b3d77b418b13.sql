
-- 1. Create admin_send_notification function (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.admin_send_notification(
  _user_id UUID,
  _title TEXT,
  _message TEXT,
  _type TEXT DEFAULT 'system',
  _data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, data, is_read, created_at)
  VALUES (_user_id, _title, _message, _type, _data, false, now())
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- 2. Fix app_settings: ensure admin can INSERT new settings (not just update existing ones)
-- The current policy uses USING() which only covers SELECT/UPDATE/DELETE, not INSERT
DROP POLICY IF EXISTS "Admins can manage app settings" ON public.app_settings;
CREATE POLICY "Admins can manage app settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3. Fix notifications: allow admin inserts via the RPC (direct inserts still blocked)
-- Keep existing "No direct notification inserts" policy as-is (blocks non-admin direct inserts)
-- The admin_send_notification function uses SECURITY DEFINER to bypass RLS

-- 4. Ensure admin can manage all key admin tables with both USING and WITH CHECK
DO $$ 
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'banners', 'gifts', 'coin_packages', 'daily_tasks', 
    'daily_login_rewards_config', 'level_privileges',
    'avatar_frames', 'entry_banners', 'entry_name_bars',
    'beauty_filters', 'ar_stickers', 'admin_notices',
    'branding_settings', 'agency_level_tiers',
    'admin_music_library', 'app_content',
    'app_event_themes', 'app_icon_registry',
    'allowed_external_links', 'categories',
    'consumption_return_config', 'diamond_exchange_packages',
    'vip_tiers'
  ])
  LOOP
    -- Drop existing admin policies
    EXECUTE format('DROP POLICY IF EXISTS "Admins full access to %I" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_manage_%I" ON public.%I', t, t);
    -- Create unified admin policy with both USING and WITH CHECK
    EXECUTE format(
      'CREATE POLICY "admin_manage_%I" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))',
      t, t
    );
  END LOOP;
END $$;

-- 5. Grant execute on the new function
GRANT EXECUTE ON FUNCTION public.admin_send_notification TO authenticated;

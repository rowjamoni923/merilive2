-- Pkg351d final admin-session role repair for legacy admin policies
-- Admin panel uses anon key + x-admin-token. These policies still enforce the
-- same admin-session/admin checks; anon is added only so custom admin sessions work.

ALTER POLICY device_bound_admins_can_view_devices ON public.admin_allowed_devices
  TO anon, authenticated
  USING (
    public.is_active_admin_session()
    AND (
      admin_user_id = public.current_admin_id_from_header()
      OR EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.id = public.current_admin_id_from_header()
          AND au.is_active = true
          AND au.role = 'owner'::public.admin_role
      )
    )
  );

ALTER POLICY pkg419_admin_sections_read ON public.admin_sections
  TO anon, authenticated
  USING (public.is_active_admin_session() OR is_active = true);

ALTER POLICY chat_bubbles_admin_all ON public.chat_bubbles
  TO anon, authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

ALTER POLICY entry_effects_admin_all ON public.entry_effects
  TO anon, authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

ALTER POLICY live_face_warnings_select_host_or_admin ON public.live_face_warnings
  TO anon, authenticated
  USING (host_id = auth.uid() OR public.is_active_admin_session());

ALTER POLICY rekognition_shards_admin_all ON public.rekognition_shards
  TO anon, authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

ALTER POLICY "Admins can view beans exchanges" ON public.user_beans_exchanges
  TO anon, authenticated
  USING (public.is_admin(auth.uid()) OR public.current_admin_id_from_header() IS NOT NULL);

ALTER POLICY user_chat_bubbles_admin_all ON public.user_chat_bubbles
  TO anon, authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

ALTER POLICY user_entry_effects_admin_all ON public.user_entry_effects
  TO anon, authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

ALTER POLICY "Admins can create purchases" ON public.user_purchases
  TO anon, authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_active_admin_session());
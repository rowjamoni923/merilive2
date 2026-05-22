DROP POLICY IF EXISTS "Admin session full access" ON public.stream_recordings;
CREATE POLICY "Admin session full access"
  ON public.stream_recordings FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());
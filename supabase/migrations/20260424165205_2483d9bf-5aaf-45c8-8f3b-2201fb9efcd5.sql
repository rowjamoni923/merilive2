DROP POLICY IF EXISTS users_update_own_role_frames ON public.user_role_frames;

CREATE POLICY users_update_own_role_frames
  ON public.user_role_frames
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
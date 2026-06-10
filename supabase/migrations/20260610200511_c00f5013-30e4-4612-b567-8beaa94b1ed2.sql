
-- Sub-wave 3D: let signed-in users read their own user_roles rows.
-- Existing admin-session policy is preserved.
CREATE POLICY user_can_read_own_roles
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

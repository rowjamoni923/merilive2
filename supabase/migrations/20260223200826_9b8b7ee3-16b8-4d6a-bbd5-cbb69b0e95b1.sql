
-- admin_login_otps: internal table, no user access needed
CREATE POLICY "No public access to admin_login_otps"
  ON public.admin_login_otps FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- rate_limit_attempts: internal table, no user access needed  
CREATE POLICY "No public access to rate_limit_attempts"
  ON public.rate_limit_attempts FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

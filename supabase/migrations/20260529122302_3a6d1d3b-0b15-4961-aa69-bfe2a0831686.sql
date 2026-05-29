
-- Pkg381 Security fixes

-- 1) admin_users.password_hash leak to sub-admins
-- Revoke column-level access from anon/authenticated; only service_role can read the hash.
REVOKE SELECT (password_hash) ON public.admin_users FROM anon, authenticated, PUBLIC;
-- Re-grant all other columns to authenticated so admin panel reads keep working.
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'admin_users'
    AND column_name <> 'password_hash';
  EXECUTE format('GRANT SELECT (%s) ON public.admin_users TO authenticated, anon', cols);
END $$;

-- 2) agency_performance — restrict reads to owning agency + admins
DROP POLICY IF EXISTS "Anyone can view performance" ON public.agency_performance;

CREATE POLICY "Agency owner can view own performance"
ON public.agency_performance
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agencies a
    WHERE a.id = agency_performance.agency_id
      AND a.owner_id = auth.uid()
  )
  OR is_active_admin_session()
  OR is_admin(auth.uid())
);

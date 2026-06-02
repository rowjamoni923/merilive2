
-- 1) admin_sections: require authenticated session (no anon enumeration of section keys)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.admin_sections'::regclass AND polname='admin_sections_read_active_admin') THEN
    EXECUTE 'DROP POLICY "admin_sections_read_active_admin" ON public.admin_sections';
  END IF;
END $$;

CREATE POLICY "pkg419_admin_sections_read"
  ON public.admin_sections
  FOR SELECT
  TO authenticated
  USING (is_active_admin_session() OR is_active = true);

-- Admin-only writes already covered by "Admin session full access"-style policies; keep as-is.

-- 2) helper_payment_methods.account_number — hide from authenticated; owners + admins keep access via SECDEF helpers/RPCs.
REVOKE SELECT (account_number) ON public.helper_payment_methods FROM authenticated;
REVOKE SELECT (account_number) ON public.helper_payment_methods FROM anon;

-- 3) topup_helpers contact columns — same treatment as payment_credentials.
REVOKE SELECT (order_notification_phone, order_notification_email, contact_info)
  ON public.topup_helpers FROM authenticated;
REVOKE SELECT (order_notification_phone, order_notification_email, contact_info)
  ON public.topup_helpers FROM anon;

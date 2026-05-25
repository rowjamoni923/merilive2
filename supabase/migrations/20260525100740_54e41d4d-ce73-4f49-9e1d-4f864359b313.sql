-- Pkg328 final pass: lock direct admin_allowed_devices table access behind device-bound admin sessions

DROP POLICY IF EXISTS "admin_devices_read" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "admin_devices_insert" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "admin_devices_update" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "Owners can manage all devices" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "Admins can view devices" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "Only admins can register devices" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "Owners can view all devices" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "Sub-admins can view own devices" ON public.admin_allowed_devices;

CREATE POLICY "device_bound_admins_can_view_devices"
ON public.admin_allowed_devices
FOR SELECT
TO authenticated
USING (
  public.is_active_admin_session()
  AND (
    admin_user_id = public.current_admin_id_from_header()
    OR EXISTS (
      SELECT 1
      FROM public.admin_users au
      WHERE au.id = public.current_admin_id_from_header()
        AND au.is_active = true
        AND au.role = 'owner'
    )
  )
);

CREATE POLICY "no_direct_admin_device_inserts"
ON public.admin_allowed_devices
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "no_direct_admin_device_updates"
ON public.admin_allowed_devices
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "no_direct_admin_device_deletes"
ON public.admin_allowed_devices
FOR DELETE
TO authenticated
USING (false);

REVOKE EXECUTE ON FUNCTION public.register_admin_device(text, text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_admin_device(text, text, jsonb, text, text) TO authenticated;
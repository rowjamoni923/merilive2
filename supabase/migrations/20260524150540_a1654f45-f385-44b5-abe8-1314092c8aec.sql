-- Pkg309 pass-2: server-only helper for custom admin password hashing

CREATE OR REPLACE FUNCTION public.service_set_admin_password(_admin_user_id uuid, _new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service role required');
  END IF;

  IF _admin_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'admin_user_id is required');
  END IF;

  IF length(coalesce(_new_password, '')) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Password must be at least 8 characters');
  END IF;

  UPDATE public.admin_users
     SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf', 10)),
         password_set_at = now(),
         must_change_password = false,
         updated_at = now()
   WHERE id = _admin_user_id
     AND role <> 'owner';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sub-admin not found');
  END IF;

  DELETE FROM public.admin_sessions WHERE admin_user_id = _admin_user_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.service_set_admin_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_set_admin_password(uuid, text) TO service_role;
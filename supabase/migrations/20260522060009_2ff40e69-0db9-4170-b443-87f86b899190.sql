CREATE OR REPLACE FUNCTION public.bump_sync_test()
RETURNS TABLE(server_time timestamptz, version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_version bigint;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.admin_broadcast (topic, version, last_event, last_row_id, updated_at)
  VALUES ('__sync_test', 1, 'TEST', NULL, v_now)
  ON CONFLICT (topic) DO UPDATE
    SET version = public.admin_broadcast.version + 1,
        last_event = 'TEST',
        updated_at = v_now
  RETURNING admin_broadcast.version INTO v_version;

  RETURN QUERY SELECT v_now, v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_sync_test() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_sync_test() FROM anon;
REVOKE ALL ON FUNCTION public.bump_sync_test() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bump_sync_test() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_sync_test() TO service_role;
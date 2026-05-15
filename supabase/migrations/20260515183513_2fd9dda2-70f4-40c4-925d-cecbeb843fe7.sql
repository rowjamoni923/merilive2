-- Pkg36: Extend admin_user_stats with face_verified + active_today (last 24h activity)
-- so AdminUserHub can use single RPC instead of 8 round-trips that risk 500-row cap.

CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_hosts bigint;
  v_blocked bigint;
  v_online bigint;
  v_verified bigint;
  v_face_verified bigint;
  v_today bigint;
  v_active_today bigint;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT count(*) INTO v_total FROM public.profiles;
  SELECT count(*) INTO v_hosts FROM public.profiles WHERE is_host = true;
  SELECT count(*) INTO v_blocked FROM public.profiles WHERE is_blocked = true;
  SELECT count(*) INTO v_online FROM public.profiles WHERE is_online = true;
  SELECT count(*) INTO v_verified FROM public.profiles WHERE is_verified = true;
  SELECT count(*) INTO v_face_verified FROM public.profiles WHERE is_face_verified = true;
  SELECT count(*) INTO v_today FROM public.profiles WHERE created_at >= date_trunc('day', now());
  SELECT count(*) INTO v_active_today FROM public.profiles WHERE updated_at >= (now() - interval '24 hours');

  RETURN jsonb_build_object(
    'total', v_total,
    'hosts', v_hosts,
    'blocked', v_blocked,
    'online', v_online,
    'verified', v_verified,
    'face_verified', v_face_verified,
    'today', v_today,
    'active_today', v_active_today
  );
END;
$$;
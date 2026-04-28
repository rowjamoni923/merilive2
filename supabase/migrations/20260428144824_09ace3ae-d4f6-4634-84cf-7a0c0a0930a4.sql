-- Package 5 (User Management hardening) — server-side aggregation RPCs
-- Avoids the 500-row REST cap and removes client-side COUNT/SUM logic.

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
  v_today bigint;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT count(*) INTO v_total FROM public.profiles;
  SELECT count(*) INTO v_hosts FROM public.profiles WHERE is_host = true;
  SELECT count(*) INTO v_blocked FROM public.profiles WHERE is_blocked = true;
  SELECT count(*) INTO v_online FROM public.profiles WHERE is_online = true;
  SELECT count(*) INTO v_verified FROM public.profiles WHERE is_verified = true;
  SELECT count(*) INTO v_today FROM public.profiles WHERE created_at >= (now() - interval '24 hours');

  RETURN jsonb_build_object(
    'total', v_total,
    'hosts', v_hosts,
    'blocked', v_blocked,
    'online', v_online,
    'verified', v_verified,
    'today', v_today
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_host_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_active bigint;
  v_pending bigint;
  v_blocked bigint;
  v_total_earnings numeric;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT count(*) INTO v_total FROM public.profiles WHERE is_host = true;
  SELECT count(*) INTO v_active FROM public.profiles
    WHERE is_host = true AND host_status = 'approved' AND is_blocked = false;
  SELECT count(*) INTO v_pending FROM public.profiles
    WHERE is_host = true AND host_status = 'pending';
  SELECT count(*) INTO v_blocked FROM public.profiles
    WHERE is_host = true AND is_blocked = true;
  SELECT COALESCE(sum(total_earnings), 0) INTO v_total_earnings FROM public.profiles
    WHERE is_host = true;

  RETURN jsonb_build_object(
    'total_hosts', v_total,
    'active_hosts', v_active,
    'pending_hosts', v_pending,
    'blocked_hosts', v_blocked,
    'total_earnings', v_total_earnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_host_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_host_stats() TO anon, authenticated;
-- Note: Functions internally enforce is_active_admin_session(); EXECUTE grant is required so PostgREST can dispatch the call.
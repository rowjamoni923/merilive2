-- Permanent diagnostic: verifies every read-only admin RPC accepts a valid admin-token session.
-- Provisions a temporary admin_sessions row, simulates the request header, executes each RPC,
-- captures any "Access denied" / errors, then cleans up. Returns a JSON report.
CREATE OR REPLACE FUNCTION public.verify_admin_token_rpc_access()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_token text;
  v_rpc text;
  v_failures jsonb := '[]'::jsonb;
  v_passed int := 0;
  v_failed int := 0;
  v_dummy jsonb;
  v_rpcs text[] := ARRAY[
    'get_admin_dashboard_stats',
    'admin_user_stats',
    'admin_host_stats',
    'admin_finance_overview_stats',
    'admin_agency_overview_stats',
    'admin_helper_management_stats',
    'admin_helper_applications_stats',
    'admin_helper_requests_stats',
    'admin_face_verification_stats',
    'admin_live_ban_stats',
    'admin_live_face_warnings_stats',
    'admin_visual_assets_stats',
    'admin_payment_gateway_stats',
    'admin_withdrawal_stats',
    'admin_moderation_overview_stats',
    'admin_reports_overview_stats',
    'admin_party_management_stats',
    'admin_payroll_orders_stats',
    'admin_entry_effects_stats',
    'admin_game_today_stats',
    'admin_realtime_publication_status',
    'admin_rekognition_shard_stats'
  ];
BEGIN
  -- Gate: only admins (panel session OR platform admin) can run this diagnostic
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  -- Pick any active owner (or active sub-admin if no owner exists)
  SELECT id INTO v_admin_id
  FROM public.admin_users
  WHERE is_active = true
  ORDER BY (role = 'owner') DESC, created_at ASC
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no active admin_users row to simulate');
  END IF;

  v_token := 'verify-' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.admin_sessions (admin_user_id, session_token, expires_at)
  VALUES (v_admin_id, v_token, now() + interval '5 minutes');

  -- Simulate PostgREST request.headers so current_admin_token_from_header() works inside this txn
  PERFORM set_config(
    'request.headers',
    jsonb_build_object('x-admin-token', v_token)::text,
    true
  );

  -- Sanity: must now resolve as admin
  IF NOT public.is_active_admin_session() THEN
    DELETE FROM public.admin_sessions WHERE session_token = v_token;
    RETURN jsonb_build_object('ok', false, 'error', 'header simulation failed');
  END IF;

  FOREACH v_rpc IN ARRAY v_rpcs LOOP
    BEGIN
      EXECUTE format('SELECT to_jsonb(public.%I())', v_rpc) INTO v_dummy;
      v_passed := v_passed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_object('rpc', v_rpc, 'error', SQLERRM);
    END;
  END LOOP;

  -- Also verify the parameterised analytics RPC (the one that triggered the recent fix)
  BEGIN
    EXECUTE 'SELECT public.get_admin_analytics_chart_data(7)' INTO v_dummy;
    v_passed := v_passed + 1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    v_failures := v_failures || jsonb_build_object('rpc', 'get_admin_analytics_chart_data', 'error', SQLERRM);
  END;

  DELETE FROM public.admin_sessions WHERE session_token = v_token;

  RETURN jsonb_build_object(
    'ok', v_failed = 0,
    'passed', v_passed,
    'failed', v_failed,
    'failures', v_failures,
    'tested_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_admin_token_rpc_access() TO authenticated, anon;

-- Run it once now, as the migration runner (which has elevated rights) bypassing the gate
-- by temporarily marking ourselves as service_role for the check.
DO $check$
DECLARE
  v_admin_id uuid;
  v_token text;
  v_failures jsonb := '[]'::jsonb;
  v_passed int := 0;
  v_failed int := 0;
  v_dummy jsonb;
  v_rpc text;
  v_rpcs text[] := ARRAY[
    'get_admin_dashboard_stats','admin_user_stats','admin_host_stats',
    'admin_finance_overview_stats','admin_agency_overview_stats',
    'admin_helper_management_stats','admin_helper_applications_stats',
    'admin_helper_requests_stats','admin_face_verification_stats',
    'admin_live_ban_stats','admin_live_face_warnings_stats',
    'admin_visual_assets_stats','admin_payment_gateway_stats',
    'admin_withdrawal_stats','admin_moderation_overview_stats',
    'admin_reports_overview_stats','admin_party_management_stats',
    'admin_payroll_orders_stats','admin_entry_effects_stats',
    'admin_game_today_stats','admin_realtime_publication_status',
    'admin_rekognition_shard_stats'
  ];
BEGIN
  SELECT id INTO v_admin_id FROM public.admin_users
  WHERE is_active = true ORDER BY (role='owner') DESC LIMIT 1;
  IF v_admin_id IS NULL THEN RAISE NOTICE '[verify] no admin to test'; RETURN; END IF;

  v_token := 'verify-' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.admin_sessions (admin_user_id, session_token, expires_at)
  VALUES (v_admin_id, v_token, now() + interval '5 minutes');

  PERFORM set_config('request.headers', jsonb_build_object('x-admin-token', v_token)::text, true);

  IF NOT public.is_active_admin_session() THEN
    DELETE FROM public.admin_sessions WHERE session_token = v_token;
    RAISE EXCEPTION '[verify] header simulation failed';
  END IF;

  FOREACH v_rpc IN ARRAY v_rpcs LOOP
    BEGIN
      EXECUTE format('SELECT to_jsonb(public.%I())', v_rpc) INTO v_dummy;
      v_passed := v_passed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_object('rpc', v_rpc, 'error', SQLERRM);
    END;
  END LOOP;

  BEGIN
    EXECUTE 'SELECT public.get_admin_analytics_chart_data(7)' INTO v_dummy;
    v_passed := v_passed + 1;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    v_failures := v_failures || jsonb_build_object('rpc','get_admin_analytics_chart_data','error',SQLERRM);
  END;

  DELETE FROM public.admin_sessions WHERE session_token = v_token;

  RAISE NOTICE '[verify] passed=% failed=% failures=%', v_passed, v_failed, v_failures::text;
  IF v_failed > 0 THEN
    RAISE EXCEPTION '[verify] % RPC(s) rejected admin-token session: %', v_failed, v_failures::text;
  END IF;
END
$check$;
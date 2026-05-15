DO $$
DECLARE
  v_admin_id uuid;
  v_token text;
  v_data jsonb;
  v_failed int := 0;
  v_rpc text;
BEGIN
  SELECT id INTO v_admin_id FROM admin_users WHERE is_active = true ORDER BY (role='owner') DESC LIMIT 1;
  v_token := 'verify-' || replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  INSERT INTO admin_sessions (admin_user_id, session_token, expires_at)
  VALUES (v_admin_id, v_token, now() + interval '5 minutes');
  PERFORM set_config('request.headers', jsonb_build_object('x-admin-token', v_token)::text, true);

  IF NOT is_active_admin_session() THEN
    DELETE FROM admin_sessions WHERE session_token = v_token;
    RAISE EXCEPTION 'header simulation failed';
  END IF;

  BEGIN
    EXECUTE 'SELECT to_jsonb(get_admin_dashboard_stats())' INTO v_data;
    RAISE NOTICE '[OK] get_admin_dashboard_stats type=%', jsonb_typeof(v_data);
  EXCEPTION WHEN OTHERS THEN v_failed := v_failed+1;
    RAISE NOTICE '[FAIL] get_admin_dashboard_stats: %', SQLERRM;
  END;

  BEGIN
    EXECUTE 'SELECT get_admin_analytics_chart_data(7)' INTO v_data;
    RAISE NOTICE '[OK] get_admin_analytics_chart_data(7d) user_growth=% gift=% call=% recharge=% agency=% summary_keys=%',
      jsonb_array_length(v_data->'user_growth'),
      jsonb_array_length(v_data->'gift_revenue'),
      jsonb_array_length(v_data->'call_activity'),
      jsonb_array_length(v_data->'recharge_revenue'),
      v_data->'agency_distribution',
      (SELECT array_agg(k) FROM jsonb_object_keys(v_data->'summary') k);
  EXCEPTION WHEN OTHERS THEN v_failed := v_failed+1;
    RAISE NOTICE '[FAIL] get_admin_analytics_chart_data(7): %', SQLERRM;
  END;

  BEGIN
    EXECUTE 'SELECT get_admin_analytics_chart_data(30)' INTO v_data;
    RAISE NOTICE '[OK] get_admin_analytics_chart_data(30d) user_growth=% gift=% call=% recharge=%',
      jsonb_array_length(v_data->'user_growth'),
      jsonb_array_length(v_data->'gift_revenue'),
      jsonb_array_length(v_data->'call_activity'),
      jsonb_array_length(v_data->'recharge_revenue');
  EXCEPTION WHEN OTHERS THEN v_failed := v_failed+1;
    RAISE NOTICE '[FAIL] get_admin_analytics_chart_data(30): %', SQLERRM;
  END;

  FOREACH v_rpc IN ARRAY ARRAY[
    'admin_user_stats','admin_host_stats','admin_finance_overview_stats',
    'admin_agency_overview_stats','admin_party_management_stats','admin_visual_assets_stats',
    'admin_payment_gateway_stats','admin_withdrawal_stats','admin_moderation_overview_stats',
    'admin_reports_overview_stats','admin_helper_management_stats','admin_face_verification_stats',
    'admin_live_ban_stats','admin_game_today_stats','admin_helper_applications_stats',
    'admin_helper_requests_stats','admin_payroll_orders_stats','admin_entry_effects_stats',
    'admin_live_face_warnings_stats','admin_realtime_publication_status','admin_rekognition_shard_stats'
  ] LOOP
    BEGIN
      EXECUTE format('SELECT to_jsonb(public.%I())', v_rpc) INTO v_data;
      RAISE NOTICE '[OK] % type=%', v_rpc, jsonb_typeof(v_data);
    EXCEPTION WHEN OTHERS THEN v_failed := v_failed+1;
      RAISE NOTICE '[FAIL] %: %', v_rpc, SQLERRM;
    END;
  END LOOP;

  DELETE FROM admin_sessions WHERE session_token = v_token;
  RAISE NOTICE '=== verification done :: failed=% ===', v_failed;
  IF v_failed > 0 THEN RAISE EXCEPTION '% chart/stat RPC(s) failed under admin-token session', v_failed; END IF;
END $$;
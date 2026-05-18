
-- 1) FIX: wrap profile credit with bypass flag (matches pattern used in claim_host_live_hour_bonus etc.)
CREATE OR REPLACE FUNCTION public.approve_rating_reward(p_claim_id uuid, p_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_claim RECORD;
  v_gender text;
  v_amount bigint;
  v_type text;
  v_cfg jsonb;
  v_host_beans bigint;
  v_user_diamonds bigint;
BEGIN
  IF NOT (public.is_admin(p_admin_id) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT CASE WHEN jsonb_typeof(setting_value::jsonb)='object' THEN setting_value::jsonb ELSE NULL END
  INTO v_cfg FROM public.app_settings WHERE setting_key='rating_reward_amounts';

  IF v_cfg IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'rating_reward_amounts not configured in admin settings');
  END IF;

  v_host_beans    := NULLIF((v_cfg->>'host_beans'),'')::bigint;
  v_user_diamonds := NULLIF((v_cfg->>'user_diamonds'),'')::bigint;
  IF v_host_beans IS NULL OR v_host_beans<=0 OR v_user_diamonds IS NULL OR v_user_diamonds<=0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'rating_reward_amounts invalid — set host_beans and user_diamonds in admin settings');
  END IF;

  SELECT * INTO v_claim FROM public.rating_reward_claims WHERE id=p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error','Claim not found'); END IF;
  IF v_claim.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error','Already processed');
  END IF;

  SELECT lower(coalesce(gender,'')) INTO v_gender FROM public.profiles WHERE id=v_claim.user_id;

  -- BYPASS sensitive-field trigger for the audited reward credit
  PERFORM set_config('app.bypass_profile_protection','true', true);

  IF v_gender='female' THEN
    v_amount := v_host_beans; v_type := 'beans';
    UPDATE public.profiles SET beans = COALESCE(beans,0) + v_amount WHERE id=v_claim.user_id;
  ELSE
    v_amount := v_user_diamonds; v_type := 'diamonds';
    UPDATE public.profiles SET coins = COALESCE(coins,0) + v_amount WHERE id=v_claim.user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection','false', true);

  UPDATE public.rating_reward_claims
     SET status='approved', reviewed_by=p_admin_id, reviewed_at=now(),
         reward_type=v_type, reward_amount=v_amount
   WHERE id=p_claim_id;

  RETURN jsonb_build_object('success', true, 'claim_id', p_claim_id, 'reward_type', v_type, 'reward_amount', v_amount);
END;
$function$;

-- 2) Re-run the full end-to-end verification
DO $e2e$
DECLARE
  _female_user uuid := 'ee43c6c0-bcfe-42ef-b289-f4c2c755df02';
  _male_user   uuid := '941b17b1-470f-42d2-a61c-93452673168e';
  _admin_id    uuid := '863d1d90-47af-4b6f-b12a-713e823b8505';
  _cfg jsonb; _host_beans bigint; _user_diam bigint;
  _beans_before bigint; _coins_before bigint;
  _beans_after  bigint; _coins_after  bigint;
  _claim_f uuid; _claim_m uuid;
  _resp jsonb; _row RECORD;
BEGIN
  RAISE NOTICE '=== Rating-Reward E2E START ===';

  SELECT setting_value::jsonb INTO _cfg FROM app_settings WHERE setting_key='rating_reward_amounts';
  _host_beans := (_cfg->>'host_beans')::bigint;
  _user_diam  := (_cfg->>'user_diamonds')::bigint;
  RAISE NOTICE '[cfg] host_beans=%, user_diamonds=%', _host_beans, _user_diam;

  SELECT COALESCE(beans,0) INTO _beans_before FROM profiles WHERE id=_female_user;

  -- 1) submit (female)
  INSERT INTO rating_reward_claims (user_id, platform, screenshot_url, status, reward_coins)
  VALUES (_female_user, 'google_play', 'https://example.test/e2e-female.png', 'pending', 0)
  RETURNING id INTO _claim_f;
  SELECT * INTO _row FROM rating_reward_claims WHERE id=_claim_f;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'FAIL: initial status=%', _row.status; END IF;
  RAISE NOTICE '[1] female claim inserted, status=pending ✓';

  -- 2) approve via RPC
  _resp := approve_rating_reward(_claim_f, _admin_id);
  IF (_resp->>'success')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: approve RPC: %', _resp; END IF;
  SELECT * INTO _row FROM rating_reward_claims WHERE id=_claim_f;
  IF _row.status      <> 'approved' THEN RAISE EXCEPTION 'FAIL: status=%', _row.status; END IF;
  IF _row.reviewed_by IS DISTINCT FROM _admin_id THEN RAISE EXCEPTION 'FAIL: reviewed_by mismatch'; END IF;
  IF _row.reviewed_at IS NULL       THEN RAISE EXCEPTION 'FAIL: reviewed_at NULL'; END IF;
  IF _row.reward_type <> 'beans'    THEN RAISE EXCEPTION 'FAIL: reward_type=%', _row.reward_type; END IF;
  IF _row.reward_amount <> _host_beans THEN RAISE EXCEPTION 'FAIL: reward_amount=% expected %', _row.reward_amount, _host_beans; END IF;
  SELECT COALESCE(beans,0) INTO _beans_after FROM profiles WHERE id=_female_user;
  IF _beans_after - _beans_before <> _host_beans THEN
    RAISE EXCEPTION 'FAIL: beans delta=% expected %', _beans_after - _beans_before, _host_beans;
  END IF;
  RAISE NOTICE '[2] APPROVE → status=approved, reviewer set, reward_type=beans, reward_amount=%, +% beans credited ✓', _host_beans, _host_beans;

  -- 3) idempotency
  _resp := approve_rating_reward(_claim_f, _admin_id);
  IF (_resp->>'success')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FAIL: re-approve allowed: %', _resp; END IF;
  RAISE NOTICE '[3] re-approve blocked (%) ✓', _resp->>'error';

  -- 4) reject (male, direct UPDATE — current UI path)
  SELECT COALESCE(coins,0) INTO _coins_before FROM profiles WHERE id=_male_user;
  INSERT INTO rating_reward_claims (user_id, platform, screenshot_url, status, reward_coins)
  VALUES (_male_user, 'google_play', 'https://example.test/e2e-male.png', 'pending', 0)
  RETURNING id INTO _claim_m;
  UPDATE rating_reward_claims
     SET status='rejected', reviewed_by=_admin_id, reviewed_at=now(),
         rejection_reason='E2E test rejection'
   WHERE id=_claim_m;
  SELECT * INTO _row FROM rating_reward_claims WHERE id=_claim_m;
  IF _row.status<>'rejected' THEN RAISE EXCEPTION 'FAIL: male status=%', _row.status; END IF;
  IF _row.reviewed_by IS DISTINCT FROM _admin_id THEN RAISE EXCEPTION 'FAIL: male reviewed_by mismatch'; END IF;
  IF _row.rejection_reason IS NULL THEN RAISE EXCEPTION 'FAIL: rejection_reason NULL'; END IF;
  SELECT COALESCE(coins,0) INTO _coins_after FROM profiles WHERE id=_male_user;
  IF _coins_after <> _coins_before THEN
    RAISE EXCEPTION 'FAIL: reject changed coins (before=% after=%)', _coins_before, _coins_after;
  END IF;
  RAISE NOTICE '[4] REJECT → status=rejected, reviewer/reason set, NO diamond credit ✓';

  -- 5) approve-after-reject must fail
  _resp := approve_rating_reward(_claim_m, _admin_id);
  IF (_resp->>'success')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'FAIL: approve-after-reject: %', _resp; END IF;
  RAISE NOTICE '[5] approve-after-reject blocked (%) ✓', _resp->>'error';

  -- cleanup
  PERFORM set_config('app.bypass_profile_protection','true', true);
  UPDATE profiles SET beans = GREATEST(0, COALESCE(beans,0) - _host_beans) WHERE id=_female_user;
  PERFORM set_config('app.bypass_profile_protection','false', true);
  DELETE FROM rating_reward_claims WHERE id IN (_claim_f, _claim_m);
  DELETE FROM notifications
   WHERE user_id IN (_female_user, _male_user)
     AND created_at > now() - interval '5 minutes'
     AND (title ILIKE '%Rating%' OR message ILIKE '%rating%');

  RAISE NOTICE '=== Rating-Reward E2E: ALL 5 STEPS PASSED, cleanup done ===';
END
$e2e$;

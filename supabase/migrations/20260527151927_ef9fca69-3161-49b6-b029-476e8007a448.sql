-- Pkg372: Admin panel global action-layer cleanup.
-- 1) Fix stale face_verification_submissions.review_notes reference in owner-approved actions.
-- 2) Restore anon EXECUTE for admin-page RPCs that are called through adminSupabase.

CREATE OR REPLACE FUNCTION public._execute_admin_pending_action(_action_type text, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_amount integer;
  v_agency uuid;
  v_delta bigint;
  v_gender text;
  v_submission uuid;
  v_action text;
  v_reason text;
  v_set_gender text;
  v_role text := public.current_effective_admin_role();
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
BEGIN
  IF NOT v_is_service AND v_role <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Owner approval required');
  END IF;

  IF _action_type NOT IN (
    'add_diamonds', 'add_beans', 'agency_beans_adjust', 'update_gender',
    'process_face_verification', 'remove_face_verification', 'reverse_auto_action'
  ) THEN
    RAISE EXCEPTION 'Unknown action_type: %', _action_type;
  END IF;

  IF _action_type = 'add_diamonds' THEN
    v_user := (_payload->>'user_id')::uuid;
    v_amount := (_payload->>'amount')::int;
    IF v_user IS NULL OR v_amount IS NULL OR v_amount = 0 OR abs(v_amount) > 10000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid diamond amount');
    END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET coins = GREATEST(COALESCE(coins,0) + v_amount, 0), updated_at = now() WHERE id = v_user;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'add_beans' THEN
    v_user := (_payload->>'user_id')::uuid;
    v_amount := (_payload->>'amount')::int;
    IF v_user IS NULL OR v_amount IS NULL OR v_amount = 0 OR abs(v_amount) > 10000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid bean amount');
    END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles SET beans = GREATEST(COALESCE(beans,0) + v_amount, 0), updated_at = now() WHERE id = v_user;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'agency_beans_adjust' THEN
    v_agency := (_payload->>'agency_id')::uuid;
    v_delta := (_payload->>'delta')::bigint;
    IF v_agency IS NULL OR v_delta IS NULL OR v_delta = 0 OR abs(v_delta) > 1000000000 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid agency bean adjustment');
    END IF;
    PERFORM set_config('app.bypass_agency_economy_guard','true',true);
    UPDATE public.agencies SET beans_balance = GREATEST(COALESCE(beans_balance,0) + v_delta, 0), updated_at = now() WHERE id = v_agency;
    PERFORM set_config('app.bypass_agency_economy_guard','false',true);
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'update_gender' THEN
    v_user := (_payload->>'user_id')::uuid;
    v_gender := _payload->>'gender';
    IF v_user IS NULL OR v_gender NOT IN ('female','male') THEN
      RETURN jsonb_build_object('success',false,'error','Invalid gender');
    END IF;
    IF public._is_target_user_owner(v_user) THEN
      RETURN jsonb_build_object('success',false,'error','Cannot target an owner account');
    END IF;
    PERFORM set_config('app.bypass_profile_protection','true',true);
    IF v_gender = 'female' THEN
      -- Convert to host CANDIDATE: do NOT auto-approve, even if previously face-verified.
      -- Force the user to (re)submit face verification and finish the onboarding mission.
      UPDATE public.profiles
         SET gender             = 'female',
             is_host            = true,
             is_face_verified   = false,
             host_status        = 'pending_face',
             face_verified_at   = NULL,
             updated_at         = now()
       WHERE id = v_user;

      -- Invalidate previous submissions. The real column is admin_notes, not review_notes.
      UPDATE public.face_verification_submissions
         SET status      = 'superseded',
             reviewed_at = now(),
             admin_notes = COALESCE(admin_notes,'') ||
               CASE WHEN COALESCE(admin_notes,'') = '' THEN '' ELSE E'\n' END ||
               '[Auto] Superseded by admin gender conversion — re-verification required.'
       WHERE user_id = v_user
         AND status IN ('approved','pending','under_review');
    ELSE
      -- Convert to plain user: clear all host flags.
      UPDATE public.profiles
         SET gender             = 'male',
             is_host            = false,
             host_status        = NULL,
             updated_at         = now()
       WHERE id = v_user;
    END IF;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success', true, 'requires_face_verification', v_gender = 'female');

  ELSIF _action_type = 'process_face_verification' THEN
    v_submission := (_payload->>'submission_id')::uuid;
    v_action := _payload->>'action';
    v_reason := _payload->>'reason';
    v_set_gender := _payload->>'set_gender';
    IF v_submission IS NULL OR v_action NOT IN ('approve','reject') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid face verification action');
    END IF;
    SELECT user_id INTO v_user FROM public.face_verification_submissions WHERE id = v_submission;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
    RETURN public._legacy_execute_face_verification(v_submission, v_action, v_reason, v_set_gender);

  ELSIF _action_type = 'remove_face_verification' THEN
    RETURN public._legacy_execute_remove_face_verification((_payload->>'user_id')::uuid, _payload->>'reason');

  ELSIF _action_type = 'reverse_auto_action' THEN
    RETURN public._legacy_reverse_auto_action((_payload->>'action_id')::uuid, _payload->>'reason');
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'No handler');
END;
$$;

COMMENT ON FUNCTION public._execute_admin_pending_action(text,jsonb) IS
'Pkg372: owner-approved admin pending action executor. Uses face_verification_submissions.admin_notes (not stale review_notes) and preserves owner/service-role gate.';

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('admin_gift_frame_to_user', 'deduct_coins_from_user')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', f.sig);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.admin_gift_frame_to_user(uuid,uuid,text,timestamp with time zone,text) IS
'Admin RPC used by GiftFrameDialog. Callable by adminSupabase anon role but internally gated by admin session checks.';

COMMENT ON FUNCTION public.deduct_coins_from_user(uuid,integer) IS
'Admin/user coin deduction RPC. Callable by adminSupabase anon role but internally gated by service/admin/self checks.';
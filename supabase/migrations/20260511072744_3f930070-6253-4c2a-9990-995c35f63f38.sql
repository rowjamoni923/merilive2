
-- Fix #1: allow service_role / internal trigger callers to use add_beans_to_user / add_diamonds_to_user
-- (leaderboard cron + reward triggers were broken by the new admin gate).
-- Fix #2: set bypass_profile_protection inside _execute_admin_pending_action for gender/face actions
-- so owner-approved actions actually mutate protected profile columns.

CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id uuid, _amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_pending uuid; v_is_service boolean;
BEGIN
  v_is_service := COALESCE(auth.role(), '') = 'service_role'
                  OR (auth.uid() IS NULL AND public.current_admin_id_from_header() IS NULL);

  IF NOT v_is_service
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT v_is_service THEN
    v_role := public._current_admin_role();
    IF v_role = 'sub_admin' THEN
      v_pending := public._enqueue_admin_pending_action('add_diamonds', _user_id, NULL,
        jsonb_build_object('user_id', _user_id, 'amount', _amount), NULL);
      RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.add_beans_to_user(_user_id uuid, _amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role text; v_pending uuid; v_is_service boolean;
BEGIN
  v_is_service := COALESCE(auth.role(), '') = 'service_role'
                  OR (auth.uid() IS NULL AND public.current_admin_id_from_header() IS NULL);

  IF NOT v_is_service
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add beans';
  END IF;

  IF NOT v_is_service THEN
    v_role := public._current_admin_role();
    IF v_role = 'sub_admin' THEN
      v_pending := public._enqueue_admin_pending_action('add_beans', _user_id, NULL,
        jsonb_build_object('user_id', _user_id, 'amount', _amount), NULL);
      RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET beans = COALESCE(beans, 0) + _amount WHERE id = _user_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- Fix #2: make _execute always set the bypass flag (it is SECURITY DEFINER and only ever
-- called from the gated owner-direct path or from admin_approve_pending_action, both of
-- which have already verified the caller is owner / admin).
CREATE OR REPLACE FUNCTION public._execute_admin_pending_action(_action_type text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid; v_amount integer; v_agency uuid; v_delta bigint; v_gender text;
  v_submission uuid; v_action text; v_reason text; v_set_gender text;
BEGIN
  -- Always bypass profile protection — caller has already been authorized.
  PERFORM set_config('app.bypass_profile_protection','true',true);

  IF _action_type = 'add_diamonds' THEN
    v_user := (_payload->>'user_id')::uuid; v_amount := (_payload->>'amount')::int;
    UPDATE profiles SET coins = COALESCE(coins,0) + v_amount WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'add_beans' THEN
    v_user := (_payload->>'user_id')::uuid; v_amount := (_payload->>'amount')::int;
    UPDATE profiles SET beans = COALESCE(beans,0) + v_amount WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'agency_beans_adjust' THEN
    v_agency := (_payload->>'agency_id')::uuid; v_delta := (_payload->>'delta')::bigint;
    UPDATE agencies SET beans_balance = COALESCE(beans_balance,0) + v_delta WHERE id = v_agency;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'update_gender' THEN
    v_user := (_payload->>'user_id')::uuid; v_gender := _payload->>'gender';
    IF v_gender NOT IN ('female','male') THEN RETURN jsonb_build_object('success',false,'error','Invalid gender'); END IF;
    UPDATE profiles SET gender = v_gender,
       is_host = CASE WHEN v_gender='female' THEN true ELSE false END,
       host_status = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN 'approved'
                          WHEN v_gender='female' THEN 'pending_face' ELSE NULL END,
       updated_at = now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'process_face_verification' THEN
    v_submission := (_payload->>'submission_id')::uuid;
    v_action := _payload->>'action'; v_reason := _payload->>'reason'; v_set_gender := _payload->>'set_gender';
    SELECT user_id INTO v_user FROM face_verification_submissions WHERE id = v_submission;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
    UPDATE face_verification_submissions
       SET status = CASE WHEN v_action='approve' THEN 'approved' ELSE 'rejected' END,
           reviewed_by = current_admin_id_from_header(), reviewed_at = now(),
           admin_notes = COALESCE(v_reason, admin_notes),
           rejection_reason = CASE WHEN v_action='reject' THEN v_reason ELSE rejection_reason END
     WHERE id = v_submission;
    IF v_action='approve' THEN
      v_gender := lower(trim(COALESCE(NULLIF(trim(COALESCE(v_set_gender,'')),''),
                  (SELECT lower(trim(COALESCE(p.gender,''))) FROM profiles p WHERE p.id = v_user),'male')));
      IF v_gender NOT IN ('female','male') THEN v_gender := 'male'; END IF;
      UPDATE face_verification_submissions
         SET verification_type = CASE WHEN v_gender='female' THEN 'host' ELSE 'user' END, updated_at = now()
       WHERE id = v_submission;
      UPDATE profiles SET is_face_verified=true, face_verified_at=now(), face_verification_status='approved',
                          gender=v_gender, is_host=(v_gender='female'),
                          host_status = CASE WHEN v_gender='female' THEN 'approved' ELSE NULL END,
                          updated_at=now() WHERE id = v_user;
    ELSE
      UPDATE profiles SET is_face_verified=false, face_verification_status='rejected',
                          host_status = CASE WHEN is_host THEN 'rejected' ELSE host_status END,
                          updated_at=now() WHERE id = v_user;
    END IF;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type = 'remove_face_verification' THEN
    v_user := (_payload->>'user_id')::uuid;
    UPDATE face_verification_submissions
       SET status='rejected', reviewed_by=current_admin_id_from_header(), reviewed_at=now(),
           admin_notes = COALESCE(admin_notes,'') || E'\n[Revoked by admin]'
     WHERE user_id = v_user AND status IN ('approved','under_review');
    UPDATE profiles SET is_face_verified=false, face_verification_status='pending_face',
                        host_status = CASE WHEN is_host THEN 'pending_face' ELSE host_status END,
                        updated_at=now() WHERE id = v_user;
    RETURN jsonb_build_object('success',true);
  END IF;
  RAISE EXCEPTION 'Unknown action_type: %', _action_type;
END $$;

GRANT EXECUTE ON FUNCTION public.add_diamonds_to_user(uuid, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.add_beans_to_user(uuid, integer) TO authenticated, anon, service_role;

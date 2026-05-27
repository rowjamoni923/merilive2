-- Pkg373: Fix remaining live critical admin action bugs from full admin audit.

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
    UPDATE public.profiles SET diamonds = GREATEST(COALESCE(diamonds,0) + v_amount, 0), updated_at = now() WHERE id = v_user;
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
      UPDATE public.profiles
         SET gender             = 'female',
             is_host            = true,
             is_face_verified   = false,
             host_status        = 'pending_face',
             face_verified_at   = NULL,
             updated_at         = now()
       WHERE id = v_user;

      UPDATE public.face_verification_submissions
         SET status      = 'superseded',
             reviewed_at = now(),
             admin_notes = COALESCE(admin_notes,'') ||
               CASE WHEN COALESCE(admin_notes,'') = '' THEN '' ELSE E'\n' END ||
               '[Auto] Superseded by admin gender conversion — re-verification required.'
       WHERE user_id = v_user
         AND status IN ('approved','pending','under_review');
    ELSE
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

CREATE OR REPLACE FUNCTION public.admin_apply_chat_punishment(_user_id uuid, _punishment_type text, _reason text DEFAULT NULL, _duration_hours integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_device_id text;
  v_live_ban_end timestamptz;
  v_violation_type text;
  v_duration integer;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['moderation','user-management','all-hosts'], true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Moderation permission required');
  END IF;
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing user id');
  END IF;
  IF public._is_target_user_owner(_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot punish owner account');
  END IF;
  IF _punishment_type NOT IN ('urgent','medium','normal') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid punishment type');
  END IF;

  IF _punishment_type IN ('urgent','medium') THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET is_host = false,
           host_status = NULL,
           is_face_verified = false,
           is_verified = false,
           user_level = 0,
           host_level = 0,
           is_blocked = true,
           blocked_reason = COALESCE(_reason, CASE WHEN _punishment_type='urgent' THEN 'Urgent Ban' ELSE 'Medium Ban' END),
           blocked_at = now(),
           updated_at = now()
     WHERE id = _user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    UPDATE public.live_streams SET is_active = false, ended_at = now()
    WHERE host_id = _user_id AND is_active = true;
  END IF;

  IF _punishment_type = 'urgent' THEN
    SELECT device_id INTO v_device_id FROM public.profiles WHERE id = _user_id;
    IF v_device_id IS NOT NULL AND v_device_id <> '' THEN
      INSERT INTO public.banned_devices (device_id, user_id, reason, banned_by, is_permanent, is_active)
      VALUES (v_device_id, _user_id, COALESCE(_reason, 'Urgent Ban - Device permanently banned'), v_admin_id, true, true)
      ON CONFLICT (device_id) DO UPDATE
        SET is_active = true,
            is_permanent = true,
            reason = EXCLUDED.reason,
            user_id = EXCLUDED.user_id,
            banned_by = EXCLUDED.banned_by,
            updated_at = now();
    END IF;
  END IF;

  IF _punishment_type = 'normal' THEN
    v_duration := GREATEST(COALESCE(_duration_hours, 0), 1);
    v_live_ban_end := now() + make_interval(hours => v_duration);
    v_violation_type := 'normal_ban';
  ELSE
    v_duration := NULL;
    v_live_ban_end := NULL;
    v_violation_type := CASE WHEN _punishment_type='urgent' THEN 'urgent_ban' ELSE 'medium_ban' END;
  END IF;

  INSERT INTO public.live_bans (user_id, ban_reason, violation_type, ban_duration_hours, ban_end, is_active, auto_banned)
  VALUES (_user_id, COALESCE(_reason, v_violation_type), v_violation_type, v_duration, v_live_ban_end, true, false);

  INSERT INTO public.admin_notifications (type, title, message, priority, data)
  VALUES (
    _punishment_type || '_ban',
    CASE WHEN _punishment_type='urgent' THEN '🚨 URGENT BAN Applied'
         WHEN _punishment_type='medium' THEN '🚫 Medium Ban Applied'
         ELSE '⏱️ Normal Ban Applied' END,
    COALESCE(_reason, 'Admin punishment applied'),
    CASE WHEN _punishment_type='urgent' THEN 'critical' WHEN _punishment_type='medium' THEN 'high' ELSE 'normal' END,
    jsonb_build_object('user_id', _user_id, 'ban_type', _punishment_type)
  );

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_admin_id, 'chat_punishment_' || _punishment_type, 'user', _user_id,
            jsonb_build_object('reason', _reason, 'duration_hours', v_duration));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'punishment_type', _punishment_type, 'duration_hours', v_duration);
END;
$$;

GRANT EXECUTE ON FUNCTION public._execute_admin_pending_action(text,jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_chat_punishment(uuid,text,text,integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public._execute_admin_pending_action(text,jsonb) IS
'Pkg373: owner-approved admin pending action executor. add_diamonds correctly updates profiles.diamonds, not coins.';
COMMENT ON FUNCTION public.admin_apply_chat_punishment(uuid,text,text,integer) IS
'Pkg373: admin chat punishment keeps gender unchanged while removing host privileges / applying bans.';
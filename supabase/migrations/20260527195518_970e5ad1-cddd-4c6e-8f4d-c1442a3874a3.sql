
-- Pkg382: when admin removes face verification (converts host → user),
-- also detach the user from any agency and clean up host_applications +
-- agency host-count.

CREATE OR REPLACE FUNCTION public._execute_admin_pending_action(_action_type text, _payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_approve_as text;
  v_rev_type text;
  v_rev_id uuid;
  v_admin uuid := public.current_admin_id_from_header();
  v_ok boolean;
  v_role text := public.current_effective_admin_role();
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_old_agency uuid;
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
      -- Demote to male user: also detach from agency (Pkg382)
      SELECT agency_id INTO v_old_agency FROM public.profiles WHERE id = v_user;

      UPDATE public.profiles
         SET gender             = 'male',
             is_host            = false,
             host_status        = NULL,
             agency_id          = NULL,
             updated_at         = now()
       WHERE id = v_user;

      IF v_old_agency IS NOT NULL THEN
        UPDATE public.agencies
           SET total_hosts = GREATEST(0, (SELECT COUNT(*) FROM public.profiles p WHERE p.agency_id = v_old_agency AND p.is_host = true)),
               updated_at = now()
         WHERE id = v_old_agency;

        UPDATE public.host_applications
           SET status = 'withdrawn',
               updated_at = now()
         WHERE user_id = v_user
           AND status IN ('pending','under_review','approved');
      END IF;
    END IF;
    PERFORM set_config('app.bypass_profile_protection','false',true);
    RETURN jsonb_build_object('success', true, 'requires_face_verification', v_gender = 'female');

  ELSIF _action_type = 'process_face_verification' THEN
    v_submission := (_payload->>'submission_id')::uuid;
    v_action     := _payload->>'action';
    v_reason     := _payload->>'reason';
    v_set_gender := _payload->>'set_gender';
    v_approve_as := COALESCE(NULLIF(_payload->>'approve_as',''), 'host');
    IF v_submission IS NULL OR v_action NOT IN ('approve','reject') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid face verification action');
    END IF;
    SELECT user_id INTO v_user FROM public.face_verification_submissions WHERE id = v_submission;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;

    PERFORM set_config('app.bypass_profile_protection','true',true);
    v_ok := public.auto_finalize_face_verification(
      v_submission, v_action, v_approve_as, v_set_gender, v_reason, NULL::text[]
    );
    PERFORM set_config('app.bypass_profile_protection','false',true);

    IF NOT COALESCE(v_ok,false) THEN
      RETURN jsonb_build_object('success',false,'error','Finalize failed');
    END IF;
    RETURN jsonb_build_object('success',true,'action',v_action);

  ELSIF _action_type = 'remove_face_verification' THEN
    v_user   := (_payload->>'user_id')::uuid;
    v_reason := _payload->>'reason';
    IF v_user IS NULL THEN
      RETURN jsonb_build_object('success',false,'error','Missing user_id');
    END IF;
    IF public._is_target_user_owner(v_user) THEN
      RETURN jsonb_build_object('success',false,'error','Cannot target an owner account');
    END IF;

    -- Pkg382: remember old agency so we can rebuild host count after detach.
    SELECT agency_id INTO v_old_agency FROM public.profiles WHERE id = v_user;

    PERFORM set_config('app.bypass_profile_protection','true',true);
    UPDATE public.profiles
       SET is_face_verified        = false,
           face_verification_image = NULL,
           face_verified_at        = NULL,
           is_host                 = false,
           host_status             = NULL,
           agency_id               = NULL,
           updated_at              = now()
     WHERE id = v_user;
    PERFORM set_config('app.bypass_profile_protection','false',true);

    UPDATE public.face_verification_submissions
       SET status      = 'superseded',
           reviewed_at = now(),
           admin_notes = COALESCE(admin_notes,'') ||
             CASE WHEN COALESCE(admin_notes,'') = '' THEN '' ELSE E'\n' END ||
             '[Admin] Face verification removed — user can re-submit' || CASE WHEN v_reason IS NULL THEN '' ELSE ' — ' || v_reason END
     WHERE user_id = v_user
       AND status IN ('approved','pending','under_review');

    IF v_old_agency IS NOT NULL THEN
      UPDATE public.agencies
         SET total_hosts = GREATEST(0, (SELECT COUNT(*) FROM public.profiles p WHERE p.agency_id = v_old_agency AND p.is_host = true)),
             updated_at = now()
       WHERE id = v_old_agency;

      UPDATE public.host_applications
         SET status = 'withdrawn',
             updated_at = now()
       WHERE user_id = v_user
         AND status IN ('pending','under_review','approved');
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, data)
    VALUES (v_user, 'Face verification removed',
            COALESCE(v_reason,
              CASE WHEN v_old_agency IS NOT NULL
                   THEN 'Your face verification was removed by an admin and you have been detached from your agency. You can submit a new face verification at any time.'
                   ELSE 'Your face verification was removed by an admin. You can submit a new face verification at any time.'
              END),
            'face_verification_removed',
            jsonb_build_object('removed_at', now(), 'detached_from_agency', v_old_agency IS NOT NULL, 'previous_agency_id', v_old_agency));

    RETURN jsonb_build_object('success',true, 'detached_from_agency', v_old_agency IS NOT NULL);

  ELSIF _action_type = 'reverse_auto_action' THEN
    v_rev_type := _payload->>'action_type';
    v_rev_id   := (_payload->>'action_id')::uuid;
    v_reason   := _payload->>'reason';
    IF v_rev_type IS NULL OR v_rev_id IS NULL THEN
      RETURN jsonb_build_object('success',false,'error','Missing action_type/action_id');
    END IF;
    RETURN public._do_reverse_auto_action(v_rev_type, v_rev_id, v_reason, v_admin);
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'No handler');
END;
$function$;

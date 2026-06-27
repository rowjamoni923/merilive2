-- Face verification approve/reject should work even on owner accounts.
-- Face verification is a self-service identity flow; owner protection here
-- was blocking owner test accounts from being approved/rejected which made
-- admin actions silently fail and leave rows stuck in Pending.
CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id uuid,
  _action text,
  _reason text DEFAULT NULL,
  _approve_as text DEFAULT 'host',
  _set_gender text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_pending uuid;
  v_user uuid;
  v_guard jsonb;
BEGIN
  SELECT user_id INTO v_user FROM public.face_verification_submissions WHERE id = _submission_id;
  IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;

  -- _protect_owner = false: face verification is self-service identity work,
  -- not a destructive admin action, so owner accounts must also be processable.
  v_guard := public._p341_assert_admin_can_target_user(
    v_user,
    ARRAY['face-verification','host-applications','user-management'],
    true,
    false
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  IF lower(trim(coalesce(_action,''))) NOT IN ('approve','reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid face verification action');
  END IF;

  v_role := public._current_admin_role();
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('process_face_verification', v_user, NULL,
      jsonb_build_object('submission_id',_submission_id,'action',lower(trim(_action)),'reason',_reason,'approve_as',_approve_as,'set_gender',_set_gender), _reason);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;

  RETURN public._execute_admin_pending_action('process_face_verification',
    jsonb_build_object('submission_id',_submission_id,'action',lower(trim(_action)),'reason',_reason,'approve_as',_approve_as,'set_gender',_set_gender));
END;
$function$;
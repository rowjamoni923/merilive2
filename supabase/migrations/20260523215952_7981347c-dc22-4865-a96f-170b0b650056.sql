CREATE OR REPLACE FUNCTION public.process_contact_violation(
  p_host_id uuid,
  p_detected_content text,
  p_detected_pattern text,
  p_source_type text,
  p_source_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_verified_host boolean := false;
  v_violation_count integer := 0;
  v_new_violation_number integer := 1;
  v_beans_deducted integer := 0;
  v_latest_violation_id uuid;
  v_severity text := 'low';
  v_action text := 'warning_only';
  v_source_uuid uuid := NULL;
  v_source_type text := lower(trim(coalesce(p_source_type, '')));
  v_content text := left(coalesce(p_detected_content, ''), 2000);
  v_pattern text := left(coalesce(nullif(trim(p_detected_pattern), ''), 'contact_sharing'), 120);
  v_role text := coalesce(auth.role(), '');
  v_uid uuid := auth.uid();
BEGIN
  IF p_host_id IS NULL THEN
    RAISE EXCEPTION 'target user is required';
  END IF;

  IF v_content = '' THEN
    RAISE EXCEPTION 'detected content is required';
  END IF;

  IF v_role NOT IN ('service_role')
     AND NOT COALESCE(public.is_admin(v_uid), false)
     AND v_uid IS DISTINCT FROM p_host_id THEN
    RAISE EXCEPTION 'forbidden contact violation target';
  END IF;

  IF v_source_type NOT IN ('chat', 'private_message', 'conversation', 'group', 'group_chat', 'party_chat', 'party', 'live_stream', 'private_call', 'video_call', 'call', 'message', 'stream', 'room', 'unknown') THEN
    v_source_type := 'unknown';
  END IF;

  IF coalesce(p_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_source_uuid := p_source_id::uuid;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  SELECT (
    COALESCE(is_host, false) = true
    AND lower(COALESCE(host_status::text, '')) = 'approved'
    AND COALESCE(is_face_verified, false) = true
  )
  INTO v_is_verified_host
  FROM public.profiles
  WHERE id = p_host_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target user not found';
  END IF;

  IF COALESCE(v_is_verified_host, false) THEN
    SELECT COUNT(*) INTO v_violation_count
    FROM public.host_contact_violations
    WHERE COALESCE(host_id, user_id) = p_host_id;

    v_new_violation_number := LEAST(v_violation_count + 1, 10);
    v_beans_deducted := 2000;
    v_severity := CASE
      WHEN v_new_violation_number >= 5 THEN 'critical'
      WHEN v_new_violation_number >= 3 THEN 'high'
      WHEN v_new_violation_number = 2 THEN 'medium'
      ELSE 'low'
    END;
    v_action := 'beans_deducted_2000';

    UPDATE public.profiles
    SET weekly_earnings = GREATEST(COALESCE(weekly_earnings, 0) - v_beans_deducted, 0),
        beans = GREATEST(COALESCE(beans, 0) - v_beans_deducted, 0),
        beans_balance = GREATEST(COALESCE(beans_balance, 0) - v_beans_deducted, 0),
        phone_violation_count = COALESCE(phone_violation_count, 0) + 1,
        updated_at = now()
    WHERE id = p_host_id;

    INSERT INTO public.host_contact_violations (
      user_id,
      host_id,
      violation_number,
      violation_type,
      detected_content,
      detected_pattern,
      source_type,
      source_id,
      severity,
      action_taken,
      beans_deducted,
      is_auto_detected,
      created_at
    ) VALUES (
      p_host_id,
      p_host_id,
      v_new_violation_number,
      v_pattern,
      v_content,
      v_pattern,
      v_source_type,
      left(coalesce(p_source_id, ''), 160),
      v_severity,
      v_action,
      v_beans_deducted,
      true,
      now()
    )
    RETURNING id INTO v_latest_violation_id;
  ELSE
    SELECT COUNT(*) INTO v_violation_count
    FROM public.user_contact_violations
    WHERE user_id = p_host_id;

    v_new_violation_number := LEAST(v_violation_count + 1, 10);

    UPDATE public.profiles
    SET phone_violation_count = COALESCE(phone_violation_count, 0) + 1,
        updated_at = now()
    WHERE id = p_host_id;

    INSERT INTO public.user_contact_violations (
      user_id,
      violation_number,
      violation_type,
      detected_content,
      detected_pattern,
      source_type,
      source_id,
      coins_deducted,
      is_auto_detected,
      created_at
    ) VALUES (
      p_host_id,
      v_new_violation_number,
      'contact_sharing',
      v_content,
      v_pattern,
      v_source_type,
      left(coalesce(p_source_id, ''), 160),
      0,
      true,
      now()
    )
    RETURNING id INTO v_latest_violation_id;
  END IF;

  INSERT INTO public.chat_moderation_logs (
    user_id,
    violation_type,
    original_content,
    detected_content,
    conversation_id,
    group_id,
    action_taken,
    detected_at,
    created_at,
    is_auto_action,
    notes
  ) VALUES (
    p_host_id,
    v_pattern,
    v_content,
    v_content,
    CASE WHEN v_source_uuid IS NOT NULL AND v_source_type IN ('chat', 'private_message', 'conversation', 'private_call', 'video_call', 'call', 'message') THEN v_source_uuid ELSE NULL END,
    CASE WHEN v_source_uuid IS NOT NULL AND v_source_type IN ('group', 'group_chat', 'party_chat', 'party', 'live_stream', 'stream', 'room') THEN v_source_uuid ELSE NULL END,
    v_action,
    now(),
    now(),
    true,
    format('Auto contact violation: source_type=%s source_id=%s verified_host=%s violation_number=%s beans_deducted=%s caller_role=%s', v_source_type, coalesce(p_source_id, 'none'), coalesce(v_is_verified_host, false), v_new_violation_number, v_beans_deducted, v_role)
  );

  RETURN jsonb_build_object(
    'success', true,
    'violation_id', v_latest_violation_id,
    'violation_number', v_new_violation_number,
    'beans_deducted', v_beans_deducted,
    'coins_deducted', 0,
    'is_banned', false,
    'is_verified_host_policy', COALESCE(v_is_verified_host, false)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.process_contact_violation(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_contact_violation(uuid, text, text, text, text) TO authenticated, service_role;
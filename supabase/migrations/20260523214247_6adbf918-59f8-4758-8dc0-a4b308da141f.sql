CREATE OR REPLACE FUNCTION public.process_contact_violation(p_host_id uuid, p_detected_content text, p_detected_pattern text, p_source_type text, p_source_id text DEFAULT NULL::text)
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
  v_source_type text := lower(coalesce(p_source_type, ''));
BEGIN
  IF coalesce(p_source_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_source_uuid := p_source_id::uuid;
  END IF;

  SELECT (
    COALESCE(is_host, false) = true
    AND lower(COALESCE(host_status::text, '')) = 'approved'
    AND COALESCE(is_face_verified, false) = true
  )
  INTO v_is_verified_host
  FROM public.profiles
  WHERE id = p_host_id;

  IF COALESCE(v_is_verified_host, false) THEN
    SELECT COUNT(*) INTO v_violation_count
    FROM public.host_contact_violations
    WHERE user_id = p_host_id;

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
        updated_at = now()
    WHERE id = p_host_id;

    INSERT INTO public.host_contact_violations (
      user_id,
      violation_type,
      detected_content,
      severity,
      action_taken,
      created_at
    ) VALUES (
      p_host_id,
      COALESCE(NULLIF(p_detected_pattern, ''), 'contact_sharing'),
      p_detected_content,
      v_severity,
      v_action,
      now()
    )
    RETURNING id INTO v_latest_violation_id;
  ELSE
    SELECT COUNT(*) INTO v_violation_count
    FROM public.user_contact_violations
    WHERE user_id = p_host_id;

    v_new_violation_number := LEAST(v_violation_count + 1, 10);

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
      p_detected_content,
      p_detected_pattern,
      p_source_type,
      p_source_id,
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
    COALESCE(NULLIF(p_detected_pattern, ''), 'contact_sharing'),
    p_detected_content,
    p_detected_content,
    CASE WHEN v_source_uuid IS NOT NULL AND v_source_type IN ('chat', 'private_message', 'conversation') THEN v_source_uuid ELSE NULL END,
    CASE WHEN v_source_uuid IS NOT NULL AND v_source_type IN ('group', 'group_chat', 'party_chat', 'party') THEN v_source_uuid ELSE NULL END,
    v_action,
    now(),
    now(),
    true,
    format('Auto contact violation: source_type=%s source_id=%s verified_host=%s violation_number=%s', coalesce(p_source_type, 'unknown'), coalesce(p_source_id, 'none'), coalesce(v_is_verified_host, false), v_new_violation_number)
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

REVOKE ALL ON FUNCTION public.process_contact_violation(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_contact_violation(uuid, text, text, text, text) TO anon, authenticated;
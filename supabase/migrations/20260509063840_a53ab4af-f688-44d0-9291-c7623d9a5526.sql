CREATE OR REPLACE FUNCTION public.process_contact_violation(
  p_host_id uuid,
  p_detected_content text,
  p_detected_pattern text,
  p_source_type text,
  p_source_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_host boolean;
  v_violation_count integer := 0;
  v_new_violation_number integer := 1;
  v_beans_deducted integer := 0;
  v_coins_deducted integer := 0;
  v_is_banned boolean := false;
  v_latest_violation_id uuid;
  v_safe_source_id uuid := NULL;
  v_current_earnings numeric := 0;
  v_notes text;
BEGIN
  IF p_source_id IS NOT NULL AND p_source_id != '' THEN
    BEGIN
      v_safe_source_id := p_source_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_safe_source_id := NULL;
    END;
  END IF;

  SELECT COALESCE(is_host, false) INTO v_is_host
  FROM public.profiles
  WHERE id = p_host_id;

  IF v_is_host THEN
    SELECT COUNT(*) INTO v_violation_count
    FROM public.host_contact_violations
    WHERE host_id = p_host_id;
  ELSE
    SELECT COUNT(*) INTO v_violation_count
    FROM public.user_contact_violations
    WHERE user_id = p_host_id;
  END IF;

  v_new_violation_number := LEAST(v_violation_count + 1, 10);

  IF v_is_host THEN
    v_beans_deducted := 2000;
    SELECT COALESCE(weekly_earnings, 0) INTO v_current_earnings
    FROM public.profiles
    WHERE id = p_host_id;

    UPDATE public.profiles
    SET weekly_earnings = COALESCE(weekly_earnings, 0) - v_beans_deducted,
        beans = COALESCE(beans, 0) - v_beans_deducted,
        updated_at = now()
    WHERE id = p_host_id;

    INSERT INTO public.host_contact_violations (
      host_id, violation_number, violation_type, detected_content,
      detected_pattern, source_type, source_id, beans_deducted, is_auto_detected
    ) VALUES (
      p_host_id, v_new_violation_number, 'contact_sharing', p_detected_content,
      p_detected_pattern, p_source_type, p_source_id, v_beans_deducted, true
    )
    RETURNING id INTO v_latest_violation_id;

    v_notes := format(
      'Violation #%s (host) | fixed_beans_deduction=%s | weekly_earnings_before=%s',
      v_new_violation_number, v_beans_deducted, v_current_earnings
    );
  ELSE
    INSERT INTO public.user_contact_violations (
      user_id, violation_number, violation_type, detected_content,
      detected_pattern, source_type, source_id, coins_deducted, is_auto_detected
    ) VALUES (
      p_host_id, v_new_violation_number, 'contact_sharing', p_detected_content,
      p_detected_pattern, p_source_type, p_source_id, 0, true
    )
    RETURNING id INTO v_latest_violation_id;

    v_notes := format(
      'Violation #%s (user) | warning_only=true',
      v_new_violation_number
    );
  END IF;

  INSERT INTO public.chat_moderation_logs (
    user_id, violation_type, detected_content, conversation_id,
    action_taken, is_auto_action, notes
  ) VALUES (
    p_host_id, p_detected_pattern, p_detected_content, v_safe_source_id,
    CASE
      WHEN v_is_host THEN 'beans_deducted_2000'
      ELSE 'warning_only'
    END,
    true,
    v_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'violation_id', v_latest_violation_id,
    'violation_number', v_new_violation_number,
    'beans_deducted', v_beans_deducted,
    'coins_deducted', v_coins_deducted,
    'is_banned', v_is_banned
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_contact_violation(uuid, text, text, text, text) TO anon, authenticated;
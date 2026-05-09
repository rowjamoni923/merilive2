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
  v_is_verified_host boolean := false;
  v_violation_count integer := 0;
  v_new_violation_number integer := 1;
  v_beans_deducted integer := 0;
  v_latest_violation_id uuid;
  v_safe_source_id uuid := NULL;
  v_notes text;
BEGIN
  IF p_source_id IS NOT NULL AND p_source_id <> '' THEN
    BEGIN
      v_safe_source_id := p_source_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_safe_source_id := NULL;
    END;
  END IF;

  SELECT (
    COALESCE(is_host, false) = true
    AND lower(COALESCE(host_status::text, '')) = 'approved'
    AND COALESCE(is_face_verified, false) = true
  )
  INTO v_is_verified_host
  FROM public.profiles
  WHERE id = p_host_id;

  IF v_is_verified_host THEN
    SELECT COUNT(*) INTO v_violation_count
    FROM public.host_contact_violations
    WHERE host_id = p_host_id;

    v_new_violation_number := LEAST(v_violation_count + 1, 10);
    v_beans_deducted := 2000;

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
      'Violation #%s (verified_host) | fixed_beans_deduction=%s',
      v_new_violation_number, v_beans_deducted
    );

    INSERT INTO public.chat_moderation_logs (
      user_id, violation_type, detected_content, conversation_id,
      action_taken, is_auto_action, notes
    ) VALUES (
      p_host_id, p_detected_pattern, p_detected_content, v_safe_source_id,
      'beans_deducted_2000', true, v_notes
    );

    RETURN jsonb_build_object(
      'success', true,
      'violation_id', v_latest_violation_id,
      'violation_number', v_new_violation_number,
      'beans_deducted', v_beans_deducted,
      'coins_deducted', 0,
      'is_banned', false,
      'is_verified_host_policy', true
    );
  END IF;

  SELECT COUNT(*) INTO v_violation_count
  FROM public.user_contact_violations
  WHERE user_id = p_host_id;

  v_new_violation_number := LEAST(v_violation_count + 1, 10);

  INSERT INTO public.user_contact_violations (
    user_id, violation_number, violation_type, detected_content,
    detected_pattern, source_type, source_id, coins_deducted, is_auto_detected
  ) VALUES (
    p_host_id, v_new_violation_number, 'contact_sharing', p_detected_content,
    p_detected_pattern, p_source_type, p_source_id, 0, true
  )
  RETURNING id INTO v_latest_violation_id;

  INSERT INTO public.chat_moderation_logs (
    user_id, violation_type, detected_content, conversation_id,
    action_taken, is_auto_action, notes
  ) VALUES (
    p_host_id, p_detected_pattern, p_detected_content, v_safe_source_id,
    'warning_only', true, 'contact warning only (non-verified-host policy)'
  );

  RETURN jsonb_build_object(
    'success', true,
    'violation_id', v_latest_violation_id,
    'violation_number', v_new_violation_number,
    'beans_deducted', 0,
    'coins_deducted', 0,
    'is_banned', false,
    'is_verified_host_policy', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_contact_violation(uuid, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_host_weekly_state_on_withdrawal(_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles p
  SET previous_host_level = COALESCE(p.host_level, 0),
      host_level = 0,
      weekly_earnings = 0,
      pending_earnings = 0,
      updated_at = now()
  WHERE p.id IN (
    SELECT ah.host_id
    FROM public.agency_hosts ah
    WHERE ah.agency_id = _agency_id
      AND COALESCE(ah.status, 'active') = 'active'
  );

  DELETE FROM public.host_contact_violations hcv
  WHERE hcv.host_id IN (
    SELECT ah.host_id
    FROM public.agency_hosts ah
    WHERE ah.agency_id = _agency_id
      AND COALESCE(ah.status, 'active') = 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_reset_host_weekly_on_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('approved', 'completed')
     AND COALESCE(OLD.status, '') IS DISTINCT FROM NEW.status THEN
    PERFORM public.reset_host_weekly_state_on_withdrawal(NEW.agency_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_host_weekly_on_withdrawal ON public.agency_withdrawals;
CREATE TRIGGER trg_reset_host_weekly_on_withdrawal
AFTER UPDATE OF status ON public.agency_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.trg_reset_host_weekly_on_withdrawal();
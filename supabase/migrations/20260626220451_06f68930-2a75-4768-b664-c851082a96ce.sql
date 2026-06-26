CREATE OR REPLACE FUNCTION public.process_contact_violation(
    p_host_id UUID,
    p_detected_content TEXT,
    p_detected_pattern TEXT,
    p_source_type TEXT,
    p_source_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start           TIMESTAMPTZ;
  v_weekly_count         INTEGER;
  v_new_weekly_number    INTEGER;
  v_flat_deduction       INTEGER := 2000;
  v_weekly_ban_threshold INTEGER := 10;
  v_beans_deducted       INTEGER := 0;
  v_is_banned            BOOLEAN := false;
  v_latest_violation_id  UUID;
  v_safe_source_id       UUID := NULL;
  v_device_id            TEXT;
  v_sender_is_host       BOOLEAN := false;
  v_sender_is_agency     BOOLEAN := false;
  v_sender_is_helper     BOOLEAN := false;
BEGIN
  SELECT
    COALESCE(p.is_host, false),
    COALESCE(p.is_agency_owner, false) OR p.agency_id IS NOT NULL,
    EXISTS (
      SELECT 1
      FROM public.topup_helpers th
      WHERE th.user_id = p.id
        AND COALESCE(th.is_active, true) = true
        AND COALESCE(th.is_verified, false) = true
    )
  INTO v_sender_is_host, v_sender_is_agency, v_sender_is_helper
  FROM public.profiles p
  WHERE p.id = p_host_id;

  -- Owner-locked rule: users, agencies, agency members, and helpers may share
  -- contact/payment numbers. Only verified hosts are subject to deductions/bans.
  IF COALESCE(v_sender_is_host, false) IS NOT TRUE
     OR COALESCE(v_sender_is_agency, false) IS TRUE
     OR COALESCE(v_sender_is_helper, false) IS TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', CASE
        WHEN COALESCE(v_sender_is_agency, false) THEN 'sender_is_agency'
        WHEN COALESCE(v_sender_is_helper, false) THEN 'sender_is_helper'
        ELSE 'sender_not_host'
      END,
      'violation_number', 0,
      'beans_deducted', 0,
      'is_banned', false
    );
  END IF;

  IF p_source_id IS NOT NULL AND p_source_id <> '' THEN
    BEGIN
      v_safe_source_id := p_source_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_safe_source_id := NULL;
    END;
  END IF;

  v_week_start := public.get_host_violation_week_start(p_host_id);

  SELECT COUNT(*) INTO v_weekly_count
    FROM public.host_contact_violations
   WHERE host_id = p_host_id
     AND created_at > v_week_start;

  v_new_weekly_number := v_weekly_count + 1;

  IF v_new_weekly_number > v_weekly_ban_threshold THEN
    v_is_banned      := true;
    v_beans_deducted := 0;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET is_blocked     = true,
           blocked_reason = 'Auto-banned: more than 10 contact-sharing violations in one week',
           blocked_at     = now(),
           updated_at     = now()
     WHERE id = p_host_id
     RETURNING device_id INTO v_device_id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    IF v_device_id IS NOT NULL AND v_device_id <> '' THEN
      INSERT INTO public.banned_devices (device_id, user_id, reason, is_active, is_permanent)
      VALUES (v_device_id, p_host_id,
              'Auto-banned: host exceeded 10 contact-sharing violations in one week',
              true, true)
      ON CONFLICT (device_id) DO UPDATE
        SET is_active    = true,
            is_permanent = true,
            reason       = EXCLUDED.reason,
            user_id      = EXCLUDED.user_id,
            banned_at    = now();
    END IF;
  ELSE
    v_beans_deducted := v_flat_deduction;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET weekly_earnings  = COALESCE(weekly_earnings,  0) - v_beans_deducted,
           pending_earnings = COALESCE(pending_earnings, 0) - v_beans_deducted,
           beans            = COALESCE(beans,            0) - v_beans_deducted,
           updated_at       = now()
     WHERE id = p_host_id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);
  END IF;

  INSERT INTO public.host_contact_violations (
    host_id, violation_number, violation_type, detected_content,
    detected_pattern, source_type, source_id, beans_deducted, is_auto_detected
  ) VALUES (
    p_host_id, v_new_weekly_number, 'contact_sharing', p_detected_content,
    p_detected_pattern, p_source_type, p_source_id, v_beans_deducted, true
  )
  RETURNING id INTO v_latest_violation_id;

  INSERT INTO public.chat_moderation_logs (
    user_id, violation_type, detected_content, conversation_id,
    action_taken, is_auto_action, notes
  ) VALUES (
    p_host_id, p_detected_pattern, p_detected_content, v_safe_source_id,
    CASE WHEN v_is_banned THEN 'account_banned'
         ELSE 'beans_deducted_' || v_beans_deducted::TEXT
    END,
    true,
    format('Weekly violation #%s (window start %s) | -%s beans',
           v_new_weekly_number, v_week_start, v_beans_deducted)
  );

  RETURN jsonb_build_object(
    'success', true,
    'violation_id',     v_latest_violation_id,
    'violation_number', v_new_weekly_number,
    'beans_deducted',   v_beans_deducted,
    'is_banned',        v_is_banned,
    'week_start',       v_week_start
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_contact_violation TO anon, authenticated, service_role;
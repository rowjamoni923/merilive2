-- Return target_minutes per hour and strictly disable eligibility when admin settings missing/invalid.
CREATE OR REPLACE FUNCTION public.get_host_live_bonus_state(_host_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile RECORD;
  _program_day INT;
  _eligible_days INT;
  _hours JSONB;
  _total_beans INT;
  _active_count INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'unauthorized');
  END IF;

  SELECT is_host, host_status, is_face_verified, face_verified_at
  INTO _profile FROM profiles WHERE id = _host_id;

  IF NOT FOUND OR COALESCE(_profile.is_host,false)=false
     OR _profile.host_status <> 'approved'
     OR COALESCE(_profile.is_face_verified,false)=false THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_verified_host');
  END IF;

  -- Strict: require at least one active hour row with valid target_minutes>0 and bonus_beans>0
  SELECT COUNT(*) INTO _active_count
  FROM new_host_live_bonus_settings
  WHERE is_active = true
    AND COALESCE(target_minutes, 0) > 0
    AND COALESCE(bonus_beans, 0) > 0
    AND hour_number IS NOT NULL;

  IF _active_count = 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_configured');
  END IF;

  SELECT MAX(eligible_program_days) INTO _eligible_days
  FROM new_host_live_bonus_settings WHERE is_active = true;

  IF _eligible_days IS NULL OR _eligible_days <= 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_configured');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'program_window_closed', 'program_days', _eligible_days);
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'hour_number', s.hour_number,
    'bonus_beans', s.bonus_beans,
    'target_minutes', COALESCE(s.target_minutes, 60),
    'minutes_accumulated', LEAST(COALESCE(p.minutes_accumulated, 0), COALESCE(s.target_minutes, 60)),
    'completed', COALESCE(p.minutes_accumulated, 0) >= COALESCE(s.target_minutes, 60),
    'claimed',   COALESCE(p.bonus_claimed, false)
  ) ORDER BY s.hour_number) INTO _hours
  FROM new_host_live_bonus_settings s
  LEFT JOIN new_host_live_bonus_progress p
    ON p.hour_number = s.hour_number AND p.host_id = _host_id AND p.program_day = _program_day
  WHERE s.is_active = true
    AND COALESCE(s.target_minutes, 0) > 0
    AND COALESCE(s.bonus_beans, 0) > 0;

  SELECT COALESCE(SUM(bonus_beans),0) INTO _total_beans
  FROM new_host_live_bonus_settings
  WHERE is_active = true
    AND COALESCE(target_minutes, 0) > 0
    AND COALESCE(bonus_beans, 0) > 0;

  RETURN jsonb_build_object(
    'eligible', true,
    'program_day', _program_day,
    'program_days', _eligible_days,
    'hours', COALESCE(_hours, '[]'::jsonb),
    'daily_total_beans', _total_beans
  );
END;
$function$;
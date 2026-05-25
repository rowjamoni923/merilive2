
-- 1) Revoke anon/PUBLIC EXECUTE on the 3 host-live-bonus RPCs (defense-in-depth)
REVOKE EXECUTE ON FUNCTION public.record_host_live_minute(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_host_live_hour_bonus(uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_host_live_bonus_state(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_host_live_minute(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_host_live_hour_bonus(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_host_live_bonus_state(uuid) TO authenticated;

-- 2) Drop duplicate public read policy on settings
DROP POLICY IF EXISTS live_bonus_settings_read_all ON public.new_host_live_bonus_settings;

-- 3) Tighten dedupe window + re-verify host eligibility at claim time
CREATE OR REPLACE FUNCTION public.record_host_live_minute(_host_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _program_day int;
  _today date := (timezone('Asia/Dhaka', now()))::date;
  _current_hour int;
  _bonus int;
  _target int;
  _live_ok boolean;
  _max_hours int;
  _filled_hours int;
  _row_count int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM live_streams ls
    WHERE ls.host_id = _host_id
      AND COALESCE(ls.is_active, false) = true
      AND ls.ended_at IS NULL
      AND ls.last_heartbeat IS NOT NULL
      AND ls.last_heartbeat > (now() - interval '3 minutes')
  ) INTO _live_ok;

  IF NOT COALESCE(_live_ok, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_live');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  SELECT COUNT(*) INTO _max_hours
  FROM new_host_live_bonus_settings
  WHERE is_active = true AND hour_number IS NOT NULL;

  IF _max_hours IS NULL OR _max_hours = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_configured');
  END IF;

  SELECT COUNT(*) INTO _filled_hours
  FROM new_host_live_bonus_progress p
  JOIN new_host_live_bonus_settings s
    ON s.hour_number = p.hour_number AND s.is_active = true
  WHERE p.host_id = _host_id AND p.program_day = _program_day
    AND p.minutes_accumulated >= COALESCE(s.target_minutes, 60);

  IF _filled_hours >= _max_hours THEN
    RETURN jsonb_build_object('success', true, 'capped', true, 'message', 'daily_cap_reached');
  END IF;

  SELECT s.hour_number, COALESCE(s.target_minutes, 60), s.bonus_beans
  INTO _current_hour, _target, _bonus
  FROM new_host_live_bonus_settings s
  LEFT JOIN new_host_live_bonus_progress p
    ON p.hour_number = s.hour_number
   AND p.host_id = _host_id
   AND p.program_day = _program_day
  WHERE s.is_active = true
    AND COALESCE(p.minutes_accumulated, 0) < COALESCE(s.target_minutes, 60)
  ORDER BY s.hour_number ASC
  LIMIT 1;

  IF _current_hour IS NULL THEN
    RETURN jsonb_build_object('success', true, 'capped', true, 'message', 'daily_cap_reached');
  END IF;

  IF _bonus IS NULL OR _bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bonus_not_configured');
  END IF;

  INSERT INTO new_host_live_bonus_progress
    (host_id, program_day, hour_number, day_number, target_minutes,
     minutes_accumulated, actual_minutes, bonus_amount, task_date, last_minute_at)
  VALUES
    (_host_id, _program_day, _current_hour, _program_day, _target, 0, 0, _bonus, _today, NULL)
  ON CONFLICT (host_id, program_day, hour_number) DO NOTHING;

  -- Tightened from 50s -> 58s so 60s client interval still ticks (2s jitter),
  -- but a malicious 50s rate is rejected (prevents earning 60-min bonus in ~50 min).
  UPDATE new_host_live_bonus_progress
  SET minutes_accumulated = LEAST(minutes_accumulated + 1, _target),
      actual_minutes      = LEAST(COALESCE(actual_minutes, 0) + 1, _target),
      target_minutes      = _target,
      bonus_amount        = _bonus,
      last_minute_at      = now()
  WHERE host_id = _host_id
    AND program_day = _program_day
    AND hour_number = _current_hour
    AND (last_minute_at IS NULL OR last_minute_at < now() - interval '58 seconds');
  GET DIAGNOSTICS _row_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'program_day', _program_day,
    'hour_number', _current_hour,
    'incremented', _row_count > 0,
    'deduped', _row_count = 0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_host_live_hour_bonus(_host_id uuid, _hour_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _program_day INT;
  _row RECORD;
  _bonus INT;
  _target INT;
  _profile RECORD;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Re-verify the caller is still a verified approved host at claim time.
  SELECT is_host, host_status, is_face_verified
  INTO _profile FROM profiles WHERE id = _host_id;
  IF NOT FOUND OR COALESCE(_profile.is_host,false)=false
     OR _profile.host_status <> 'approved'
     OR COALESCE(_profile.is_face_verified,false)=false THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_verified_host');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  SELECT bonus_beans, COALESCE(target_minutes,60)
  INTO _bonus, _target
  FROM public.new_host_live_bonus_settings
  WHERE hour_number = _hour_number AND is_active = true
  LIMIT 1;

  IF _bonus IS NULL OR _bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bonus_not_configured');
  END IF;

  SELECT * INTO _row FROM public.new_host_live_bonus_progress
  WHERE host_id = _host_id AND program_day = _program_day AND hour_number = _hour_number
  FOR UPDATE;

  IF NOT FOUND OR _row.minutes_accumulated < _target THEN
    RETURN jsonb_build_object('success', false, 'error', 'hour_incomplete');
  END IF;
  IF _row.bonus_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET beans = COALESCE(beans, 0) + _bonus WHERE id = _host_id;
  UPDATE public.new_host_live_bonus_progress
  SET bonus_claimed = true, claimed_at = NOW(), claimed_beans = _bonus,
      is_completed = true, completed_at = NOW()
  WHERE id = _row.id;
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (_host_id, 'bonus', '🎉 Live Hour Bonus!',
          'You earned ' || _bonus || ' Beans for completing hour ' || _hour_number,
          jsonb_build_object('beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day));
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object('success', true, 'beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day);
END;
$function$;

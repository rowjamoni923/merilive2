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
  _live_ok boolean;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM live_streams ls
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

  SELECT p.hour_number INTO _current_hour
  FROM new_host_live_bonus_progress p
  WHERE p.host_id = _host_id AND p.program_day = _program_day
    AND p.minutes_accumulated < 60
  ORDER BY p.hour_number ASC LIMIT 1;

  IF _current_hour IS NULL THEN
    SELECT MIN(s.hour_number) INTO _current_hour
    FROM new_host_live_bonus_settings s
    WHERE s.is_active = true
      AND s.hour_number NOT IN (
        SELECT hour_number FROM new_host_live_bonus_progress
        WHERE host_id = _host_id AND program_day = _program_day AND hour_number IS NOT NULL
      );
    IF _current_hour IS NULL THEN
      RETURN jsonb_build_object('success', true, 'capped', true, 'message', 'daily_cap_reached');
    END IF;
  END IF;

  SELECT bonus_beans INTO _bonus FROM new_host_live_bonus_settings
  WHERE hour_number = _current_hour AND is_active = true LIMIT 1;

  INSERT INTO new_host_live_bonus_progress
    (host_id, program_day, hour_number, day_number, target_minutes, minutes_accumulated, actual_minutes, bonus_amount, task_date)
  VALUES
    (_host_id, _program_day, _current_hour, _program_day, 60, 1, 1, COALESCE(_bonus, 10000), _today)
  ON CONFLICT (host_id, program_day, hour_number)
  DO UPDATE SET
    minutes_accumulated = LEAST(new_host_live_bonus_progress.minutes_accumulated + 1, 60),
    actual_minutes = LEAST(new_host_live_bonus_progress.minutes_accumulated + 1, 60);

  RETURN jsonb_build_object('success', true, 'program_day', _program_day, 'hour_number', _current_hour);
END;
$function$;
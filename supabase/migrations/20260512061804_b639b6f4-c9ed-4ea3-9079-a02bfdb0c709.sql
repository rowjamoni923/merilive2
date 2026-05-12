-- Align New-Host hourly bonus daily window with calendar BST midnight
UPDATE public.new_host_live_bonus_settings
SET daily_reset_offset_minutes = 0
WHERE daily_reset_offset_minutes <> 0;

-- Keep only the first 5 hour slots active (strict 5h/day cap)
UPDATE public.new_host_live_bonus_settings
SET is_active = false
WHERE hour_number IS NULL OR hour_number > 5 OR hour_number < 1;

-- Harden record_host_live_minute: strict 5-hour cap, no hardcoded fallback
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
  _max_hours int;
  _filled_hours int;
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

  SELECT COUNT(*) INTO _filled_hours
  FROM new_host_live_bonus_progress
  WHERE host_id = _host_id AND program_day = _program_day
    AND minutes_accumulated >= 60;

  IF _filled_hours >= _max_hours THEN
    RETURN jsonb_build_object('success', true, 'capped', true, 'message', 'daily_cap_reached');
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

  IF _bonus IS NULL OR _bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bonus_not_configured');
  END IF;

  INSERT INTO new_host_live_bonus_progress
    (host_id, program_day, hour_number, day_number, target_minutes,
     minutes_accumulated, actual_minutes, bonus_amount, task_date)
  VALUES
    (_host_id, _program_day, _current_hour, _program_day, 60, 1, 1, _bonus, _today)
  ON CONFLICT (host_id, program_day, hour_number)
  DO UPDATE SET
    minutes_accumulated = LEAST(new_host_live_bonus_progress.minutes_accumulated + 1, 60),
    actual_minutes      = LEAST(new_host_live_bonus_progress.minutes_accumulated + 1, 60);

  RETURN jsonb_build_object(
    'success', true,
    'program_day', _program_day,
    'hour_number', _current_hour
  );
END;
$function$;

-- Realtime publication for instant UI updates on the bonus card
ALTER TABLE public.new_host_live_bonus_progress REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'new_host_live_bonus_progress'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.new_host_live_bonus_progress';
  END IF;
END$$;

DROP INDEX IF EXISTS public.ux_new_host_live_bonus_progress_slot;

CREATE OR REPLACE FUNCTION public.sync_new_host_live_bonus_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _host_created_at timestamptz;
  _is_host boolean;
  _program_day int;
  _stream_started timestamptz;
  _stream_ended   timestamptz;
  _minutes int;
  _remaining int;
  _max_program_day int;
  _hour_row RECORD;
  _existing_minutes int;
  _add int;
  _reset_date date := public.get_task_reset_date();
BEGIN
  IF NEW.ended_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.ended_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT created_at, COALESCE(is_host, false) INTO _host_created_at, _is_host
  FROM public.profiles WHERE id = NEW.host_id;
  IF NOT FOUND OR NOT _is_host THEN RETURN NEW; END IF;

  _program_day := GREATEST(1, (EXTRACT(DAY FROM (now() - _host_created_at))::int + 1));

  SELECT COALESCE(MAX(day_number), 0) INTO _max_program_day
  FROM public.new_host_live_bonus_settings WHERE is_active = true;
  IF _max_program_day = 0 OR _program_day > _max_program_day THEN RETURN NEW; END IF;

  _stream_started := COALESCE(NEW.started_at, NEW.created_at);
  _stream_ended   := NEW.ended_at;
  _minutes := GREATEST(0, EXTRACT(EPOCH FROM (_stream_ended - _stream_started))::int / 60);
  IF _minutes = 0 THEN RETURN NEW; END IF;
  _remaining := _minutes;

  FOR _hour_row IN
    SELECT hour_number, target_minutes, bonus_amount
    FROM public.new_host_live_bonus_settings
    WHERE is_active = true AND day_number = _program_day
    ORDER BY hour_number
  LOOP
    EXIT WHEN _remaining <= 0;

    SELECT COALESCE(actual_minutes, 0) INTO _existing_minutes
    FROM public.new_host_live_bonus_progress
    WHERE host_id = NEW.host_id AND program_day = _program_day AND hour_number = _hour_row.hour_number
    FOR UPDATE;
    _existing_minutes := COALESCE(_existing_minutes, 0);
    IF _existing_minutes >= _hour_row.target_minutes THEN CONTINUE; END IF;

    _add := LEAST(_remaining, _hour_row.target_minutes - _existing_minutes);

    INSERT INTO public.new_host_live_bonus_progress (
      host_id, day_number, program_day, hour_number,
      target_minutes, actual_minutes, minutes_accumulated,
      bonus_amount, claimed_beans, is_completed, bonus_claimed,
      task_date, last_minute_at
    ) VALUES (
      NEW.host_id, _program_day, _program_day, _hour_row.hour_number,
      _hour_row.target_minutes, _add, _add,
      _hour_row.bonus_amount, 0,
      _add >= _hour_row.target_minutes, false,
      _reset_date, now()
    )
    ON CONFLICT (host_id, program_day, hour_number) WHERE (program_day IS NOT NULL AND hour_number IS NOT NULL) DO UPDATE
    SET actual_minutes      = LEAST(public.new_host_live_bonus_progress.actual_minutes + EXCLUDED.actual_minutes, EXCLUDED.target_minutes),
        minutes_accumulated = LEAST(public.new_host_live_bonus_progress.minutes_accumulated + EXCLUDED.minutes_accumulated, EXCLUDED.target_minutes),
        is_completed        = (LEAST(public.new_host_live_bonus_progress.actual_minutes + EXCLUDED.actual_minutes, EXCLUDED.target_minutes) >= EXCLUDED.target_minutes),
        completed_at        = CASE
                                WHEN (LEAST(public.new_host_live_bonus_progress.actual_minutes + EXCLUDED.actual_minutes, EXCLUDED.target_minutes) >= EXCLUDED.target_minutes)
                                 AND public.new_host_live_bonus_progress.completed_at IS NULL
                                THEN now() ELSE public.new_host_live_bonus_progress.completed_at
                              END,
        last_minute_at      = now();

    _remaining := _remaining - _add;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 90-day backfill
DO $$
DECLARE
  s RECORD;
  _host_created_at timestamptz;
  _program_day int;
  _minutes int;
  _remaining int;
  _max_program_day int;
  _hour_row RECORD;
  _existing_minutes int;
  _add int;
  _reset_date date;
BEGIN
  SELECT COALESCE(MAX(day_number), 0) INTO _max_program_day
  FROM public.new_host_live_bonus_settings WHERE is_active = true;
  IF _max_program_day = 0 THEN RETURN; END IF;

  FOR s IN
    SELECT ls.host_id, COALESCE(ls.started_at, ls.created_at) AS started_at, ls.ended_at
    FROM public.live_streams ls
    JOIN public.profiles p ON p.id = ls.host_id AND COALESCE(p.is_host, false)
    WHERE ls.ended_at IS NOT NULL AND ls.ended_at > now() - interval '90 days'
    ORDER BY ls.ended_at ASC
  LOOP
    SELECT created_at INTO _host_created_at FROM public.profiles WHERE id = s.host_id;
    _program_day := GREATEST(1, (EXTRACT(DAY FROM (s.ended_at - _host_created_at))::int + 1));
    IF _program_day > _max_program_day THEN CONTINUE; END IF;

    _minutes := GREATEST(0, EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::int / 60);
    IF _minutes = 0 THEN CONTINUE; END IF;
    _remaining := _minutes;
    _reset_date := (s.ended_at AT TIME ZONE 'Europe/London')::date;

    FOR _hour_row IN
      SELECT hour_number, target_minutes, bonus_amount
      FROM public.new_host_live_bonus_settings
      WHERE is_active = true AND day_number = _program_day
      ORDER BY hour_number
    LOOP
      EXIT WHEN _remaining <= 0;

      SELECT COALESCE(actual_minutes, 0) INTO _existing_minutes
      FROM public.new_host_live_bonus_progress
      WHERE host_id = s.host_id AND program_day = _program_day AND hour_number = _hour_row.hour_number;
      _existing_minutes := COALESCE(_existing_minutes, 0);
      IF _existing_minutes >= _hour_row.target_minutes THEN CONTINUE; END IF;

      _add := LEAST(_remaining, _hour_row.target_minutes - _existing_minutes);

      INSERT INTO public.new_host_live_bonus_progress (
        host_id, day_number, program_day, hour_number,
        target_minutes, actual_minutes, minutes_accumulated,
        bonus_amount, claimed_beans, is_completed, bonus_claimed,
        task_date, last_minute_at
      ) VALUES (
        s.host_id, _program_day, _program_day, _hour_row.hour_number,
        _hour_row.target_minutes, _add, _add,
        _hour_row.bonus_amount, 0,
        _add >= _hour_row.target_minutes, false,
        _reset_date, s.ended_at
      )
      ON CONFLICT (host_id, program_day, hour_number) WHERE (program_day IS NOT NULL AND hour_number IS NOT NULL) DO UPDATE
      SET actual_minutes      = LEAST(public.new_host_live_bonus_progress.actual_minutes + EXCLUDED.actual_minutes, EXCLUDED.target_minutes),
          minutes_accumulated = LEAST(public.new_host_live_bonus_progress.minutes_accumulated + EXCLUDED.minutes_accumulated, EXCLUDED.target_minutes),
          is_completed        = (LEAST(public.new_host_live_bonus_progress.actual_minutes + EXCLUDED.actual_minutes, EXCLUDED.target_minutes) >= EXCLUDED.target_minutes),
          last_minute_at      = EXCLUDED.last_minute_at;

      _remaining := _remaining - _add;
    END LOOP;
  END LOOP;
END $$;

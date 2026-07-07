CREATE OR REPLACE FUNCTION public.record_host_live_bonus_elapsed(_host_id uuid, _source text DEFAULT 'server')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _profile RECORD;
  _program_day INT;
  _eligible_days INT;
  _max_hours INT;
  _reset_offset INT;
  _stream RECORD;
  _day_start_local TIMESTAMP;
  _day_start TIMESTAMPTZ;
  _day_end TIMESTAMPTZ;
  _task_date DATE;
  _last_counted_at TIMESTAMPTZ;
  _from_ts TIMESTAMPTZ;
  _to_ts TIMESTAMPTZ := now();
  _minutes_to_add INT;
  _remaining INT;
  _added INT := 0;
  _slot RECORD;
  _progress RECORD;
  _space INT;
  _delta INT;
  _configured_rows INT;
BEGIN
  SELECT is_host, host_status, is_face_verified
  INTO _profile
  FROM public.profiles
  WHERE id = _host_id;

  IF NOT FOUND OR COALESCE(_profile.is_host, false) = false
     OR _profile.host_status <> 'approved'
     OR COALESCE(_profile.is_face_verified, false) = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_verified_host');
  END IF;

  SELECT MAX(max_hours_per_day), MAX(daily_reset_offset_minutes), MAX(eligible_program_days), COUNT(*)
  INTO _max_hours, _reset_offset, _eligible_days, _configured_rows
  FROM public.new_host_live_bonus_settings
  WHERE is_active = true
    AND hour_number IS NOT NULL
    AND COALESCE(target_minutes, 0) > 0
    AND COALESCE(bonus_beans, 0) > 0;

  IF _configured_rows = 0 OR _max_hours IS NULL OR _max_hours <= 0
     OR _reset_offset IS NULL OR _eligible_days IS NULL OR _eligible_days <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_configured');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  SELECT id, started_at, last_heartbeat
  INTO _stream
  FROM public.live_streams
  WHERE host_id = _host_id
    AND COALESCE(is_active, false) = true
    AND ended_at IS NULL
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat > (now() - interval '3 minutes')
  ORDER BY last_heartbeat DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_live');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('host_live_bonus'), hashtext(_host_id::text));

  _day_start_local := date_trunc('day', timezone('Asia/Dhaka', _to_ts) - (_reset_offset || ' minutes')::interval)
                      + (_reset_offset || ' minutes')::interval;
  _day_start := _day_start_local AT TIME ZONE 'Asia/Dhaka';
  _day_end := _day_start + interval '1 day';
  _task_date := _day_start_local::date;
  _to_ts := LEAST(_to_ts, _day_end);

  SELECT MAX(last_minute_at)
  INTO _last_counted_at
  FROM public.new_host_live_bonus_progress
  WHERE host_id = _host_id
    AND program_day = _program_day;

  _from_ts := GREATEST(
    COALESCE(_last_counted_at, _stream.started_at, _day_start),
    COALESCE(_stream.started_at, _day_start),
    _day_start
  );

  IF _to_ts <= _from_ts THEN
    RETURN jsonb_build_object(
      'success', true,
      'incremented', false,
      'deduped', true,
      'minutes_added', 0,
      'program_day', _program_day,
      'source', _source
    );
  END IF;

  _minutes_to_add := FLOOR(EXTRACT(EPOCH FROM (_to_ts - _from_ts)) / 60)::INT;
  IF _minutes_to_add <= 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'incremented', false,
      'deduped', true,
      'minutes_added', 0,
      'program_day', _program_day,
      'source', _source
    );
  END IF;

  _remaining := _minutes_to_add;

  FOR _slot IN
    SELECT hour_number, target_minutes, bonus_beans
    FROM public.new_host_live_bonus_settings
    WHERE is_active = true
      AND hour_number IS NOT NULL
      AND COALESCE(target_minutes, 0) > 0
      AND COALESCE(bonus_beans, 0) > 0
    ORDER BY hour_number ASC
    LIMIT _max_hours
  LOOP
    EXIT WHEN _remaining <= 0;

    INSERT INTO public.new_host_live_bonus_progress
      (host_id, program_day, hour_number, day_number, target_minutes,
       minutes_accumulated, actual_minutes, bonus_amount, task_date, last_minute_at)
    VALUES
      (_host_id, _program_day, _slot.hour_number, _program_day, _slot.target_minutes,
       0, 0, _slot.bonus_beans, _task_date, NULL)
    ON CONFLICT (host_id, program_day, hour_number) DO NOTHING;

    SELECT *
    INTO _progress
    FROM public.new_host_live_bonus_progress
    WHERE host_id = _host_id
      AND program_day = _program_day
      AND hour_number = _slot.hour_number
    FOR UPDATE;

    _space := GREATEST(_slot.target_minutes - COALESCE(_progress.minutes_accumulated, 0), 0);
    IF _space <= 0 THEN
      CONTINUE;
    END IF;

    _delta := LEAST(_remaining, _space);

    UPDATE public.new_host_live_bonus_progress
    SET minutes_accumulated = LEAST(COALESCE(minutes_accumulated, 0) + _delta, _slot.target_minutes),
        actual_minutes = LEAST(COALESCE(actual_minutes, 0) + _delta, _slot.target_minutes),
        target_minutes = _slot.target_minutes,
        bonus_amount = _slot.bonus_beans,
        task_date = _task_date,
        last_minute_at = _to_ts,
        is_completed = (LEAST(COALESCE(minutes_accumulated, 0) + _delta, _slot.target_minutes) >= _slot.target_minutes),
        completed_at = CASE
          WHEN completed_at IS NULL
           AND LEAST(COALESCE(minutes_accumulated, 0) + _delta, _slot.target_minutes) >= _slot.target_minutes
          THEN now()
          ELSE completed_at
        END,
        updated_at = now()
    WHERE id = _progress.id;

    _remaining := _remaining - _delta;
    _added := _added + _delta;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'program_day', _program_day,
    'minutes_added', _added,
    'incremented', _added > 0,
    'deduped', _added = 0,
    'capped', _added < _minutes_to_add,
    'daily_paid_hours_cap', _max_hours,
    'source', _source
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_active_host_live_bonus_minutes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _host RECORD;
  _result jsonb;
  _processed INT := 0;
  _credited INT := 0;
BEGIN
  FOR _host IN
    SELECT DISTINCT ls.host_id
    FROM public.live_streams ls
    JOIN public.profiles p ON p.id = ls.host_id
    WHERE COALESCE(ls.is_active, false) = true
      AND ls.ended_at IS NULL
      AND ls.last_heartbeat IS NOT NULL
      AND ls.last_heartbeat > (now() - interval '3 minutes')
      AND COALESCE(p.is_host, false) = true
      AND p.host_status = 'approved'
      AND COALESCE(p.is_face_verified, false) = true
  LOOP
    _processed := _processed + 1;
    _result := public.record_host_live_bonus_elapsed(_host.host_id, 'cron');
    IF COALESCE((_result->>'minutes_added')::INT, 0) > 0 THEN
      _credited := _credited + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed_hosts', _processed, 'credited_hosts', _credited);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_host_live_minute(_host_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  RETURN public.record_host_live_bonus_elapsed(_host_id, 'client');
END;
$function$;

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
  _max_hours INT;
  _configured_rows INT;
  _hours JSONB;
  _milestones JSONB;
  _total_beans INT;
  _minutes_streamed INT;
  _coins_earned INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'unauthorized');
  END IF;

  SELECT is_host, host_status, is_face_verified, face_verified_at
  INTO _profile
  FROM public.profiles
  WHERE id = _host_id;

  IF NOT FOUND OR COALESCE(_profile.is_host, false) = false
     OR _profile.host_status <> 'approved'
     OR COALESCE(_profile.is_face_verified, false) = false THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_verified_host');
  END IF;

  SELECT MAX(max_hours_per_day), MAX(eligible_program_days), COUNT(*)
  INTO _max_hours, _eligible_days, _configured_rows
  FROM public.new_host_live_bonus_settings
  WHERE is_active = true
    AND hour_number IS NOT NULL
    AND COALESCE(target_minutes, 0) > 0
    AND COALESCE(bonus_beans, 0) > 0;

  IF _configured_rows = 0 OR _max_hours IS NULL OR _max_hours <= 0
     OR _eligible_days IS NULL OR _eligible_days <= 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_configured');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'program_window_closed', 'program_days', _eligible_days);
  END IF;

  WITH active_slots AS (
    SELECT hour_number, target_minutes, bonus_beans
    FROM public.new_host_live_bonus_settings
    WHERE is_active = true
      AND hour_number IS NOT NULL
      AND COALESCE(target_minutes, 0) > 0
      AND COALESCE(bonus_beans, 0) > 0
    ORDER BY hour_number ASC
    LIMIT _max_hours
  ), joined AS (
    SELECT s.hour_number,
           s.target_minutes,
           s.bonus_beans,
           LEAST(COALESCE(p.minutes_accumulated, 0), s.target_minutes) AS minutes_accumulated,
           (COALESCE(p.minutes_accumulated, 0) >= s.target_minutes) AS completed,
           COALESCE(p.bonus_claimed, false) AS claimed,
           COALESCE(p.claimed_beans, 0) AS claimed_beans
    FROM active_slots s
    LEFT JOIN public.new_host_live_bonus_progress p
      ON p.hour_number = s.hour_number
     AND p.host_id = _host_id
     AND p.program_day = _program_day
  )
  SELECT jsonb_agg(jsonb_build_object(
           'hour_number', hour_number,
           'bonus_beans', bonus_beans,
           'target_minutes', target_minutes,
           'minutes_accumulated', minutes_accumulated,
           'completed', completed,
           'claimed', claimed
         ) ORDER BY hour_number),
         jsonb_agg(jsonb_build_object(
           'label', 'Hour ' || hour_number,
           'hour', hour_number,
           'minutes_goal', target_minutes,
           'reward_coins', bonus_beans,
           'achieved', completed,
           'claimed', claimed
         ) ORDER BY hour_number),
         COALESCE(SUM(bonus_beans), 0),
         COALESCE(SUM(minutes_accumulated), 0),
         COALESCE(SUM(claimed_beans), 0)
  INTO _hours, _milestones, _total_beans, _minutes_streamed, _coins_earned
  FROM joined;

  RETURN jsonb_build_object(
    'eligible', true,
    'program_day', _program_day,
    'program_days', _eligible_days,
    'days_left', GREATEST(_eligible_days - _program_day + 1, 0),
    'daily_paid_hours_cap', _max_hours,
    'hours', COALESCE(_hours, '[]'::jsonb),
    'milestones', COALESCE(_milestones, '[]'::jsonb),
    'daily_total_beans', _total_beans,
    'minutes_streamed', _minutes_streamed,
    'coins_earned', _coins_earned
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
  _max_hours INT;
  _configured_rows INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT is_host, host_status, is_face_verified
  INTO _profile
  FROM public.profiles
  WHERE id = _host_id;

  IF NOT FOUND OR COALESCE(_profile.is_host, false) = false
     OR _profile.host_status <> 'approved'
     OR COALESCE(_profile.is_face_verified, false) = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_verified_host');
  END IF;

  SELECT MAX(max_hours_per_day), COUNT(*)
  INTO _max_hours, _configured_rows
  FROM public.new_host_live_bonus_settings
  WHERE is_active = true
    AND hour_number IS NOT NULL
    AND COALESCE(target_minutes, 0) > 0
    AND COALESCE(bonus_beans, 0) > 0;

  IF _configured_rows = 0 OR _max_hours IS NULL OR _max_hours <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_configured');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  SELECT s.bonus_beans, s.target_minutes
  INTO _bonus, _target
  FROM (
    SELECT hour_number, bonus_beans, target_minutes
    FROM public.new_host_live_bonus_settings
    WHERE is_active = true
      AND hour_number IS NOT NULL
      AND COALESCE(target_minutes, 0) > 0
      AND COALESCE(bonus_beans, 0) > 0
    ORDER BY hour_number ASC
    LIMIT _max_hours
  ) s
  WHERE s.hour_number = _hour_number
  LIMIT 1;

  IF _bonus IS NULL OR _target IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'hour_not_in_daily_cap');
  END IF;

  SELECT *
  INTO _row
  FROM public.new_host_live_bonus_progress
  WHERE host_id = _host_id
    AND program_day = _program_day
    AND hour_number = _hour_number
  FOR UPDATE;

  IF NOT FOUND OR COALESCE(_row.minutes_accumulated, 0) < _target THEN
    RETURN jsonb_build_object('success', false, 'error', 'hour_incomplete');
  END IF;

  IF _row.bonus_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET beans = COALESCE(beans, 0) + _bonus
  WHERE id = _host_id;

  UPDATE public.new_host_live_bonus_progress
  SET bonus_claimed = true,
      claimed_at = now(),
      claimed_beans = _bonus,
      is_completed = true,
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = _row.id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    _host_id,
    'bonus',
    'Live Hour Bonus',
    'You earned ' || _bonus || ' Beans for completing hour ' || _hour_number,
    jsonb_build_object('beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day)
  );

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object('success', true, 'beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_host_live_bonus_elapsed(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_active_host_live_bonus_minutes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_host_live_minute(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_host_live_bonus_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_host_live_hour_bonus(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_host_live_bonus_elapsed(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_active_host_live_bonus_minutes() TO service_role;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'host-live-bonus-minute-ledger';

SELECT cron.schedule(
  'host-live-bonus-minute-ledger',
  '* * * * *',
  $$SELECT public.record_active_host_live_bonus_minutes();$$
);

-- 1) Race-proof claim_task_reward
CREATE OR REPLACE FUNCTION public.claim_task_reward(_user_id uuid, _task_id uuid, _task_date text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _task RECORD;
  _progress RECORD;
  _expected_key text;
  _claim_count int;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden', 'beans', 0, 'coins', 0);
  END IF;

  SELECT * INTO _task FROM public.daily_tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found', 'beans', 0, 'coins', 0);
  END IF;

  _expected_key := CASE COALESCE(_task.mission_bucket, 'daily')
    WHEN 'weekly' THEN to_char(public.get_task_week_reset_date(), 'YYYY-MM-DD')
    WHEN 'achievement' THEN '1970-01-01'
    ELSE to_char(public.get_task_reset_date(), 'YYYY-MM-DD')
  END;

  IF _task_date IS NOT NULL AND length(trim(_task_date)) > 0 AND trim(_task_date) <> _expected_key THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task period mismatch', 'beans', 0, 'coins', 0);
  END IF;

  -- Lock the progress row to serialize concurrent claims.
  SELECT * INTO _progress FROM public.user_task_progress
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _expected_key
  FOR UPDATE;

  IF NOT FOUND OR NOT COALESCE(_progress.is_completed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed', 'beans', 0, 'coins', 0);
  END IF;

  IF COALESCE(_progress.is_claimed, false) OR COALESCE(_progress.reward_claimed, false) THEN
    RETURN jsonb_build_object(
      'success', true, 'already_claimed', true,
      'beans', 0, 'coins', 0, 'beans_earned', 0, 'coins_earned', 0
    );
  END IF;

  -- Atomic transition: only one tx will get row_count > 0.
  UPDATE public.user_task_progress
  SET is_claimed = true, reward_claimed = true
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _expected_key
    AND COALESCE(is_claimed, false) = false
    AND COALESCE(reward_claimed, false) = false;
  GET DIAGNOSTICS _claim_count = ROW_COUNT;

  IF _claim_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'already_claimed', true,
      'beans', 0, 'coins', 0, 'beans_earned', 0, 'coins_earned', 0
    );
  END IF;

  IF COALESCE(_task.reward_beans, 0) > 0 THEN
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + _task.reward_beans WHERE id = _user_id;
  END IF;

  IF COALESCE(_task.reward_coins, 0) > 0 THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + _task.reward_coins WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_claimed', false,
    'beans', COALESCE(_task.reward_beans, 0),
    'coins', COALESCE(_task.reward_coins, 0),
    'beans_earned', COALESCE(_task.reward_beans, 0),
    'coins_earned', COALESCE(_task.reward_coins, 0)
  );
END;
$function$;

-- 2) Per-minute idempotency for host live-minute tracking
ALTER TABLE public.new_host_live_bonus_progress
  ADD COLUMN IF NOT EXISTS last_minute_at timestamptz;

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

  -- Insert-or-no-op (used purely to materialize the row).
  INSERT INTO new_host_live_bonus_progress
    (host_id, program_day, hour_number, day_number, target_minutes,
     minutes_accumulated, actual_minutes, bonus_amount, task_date, last_minute_at)
  VALUES
    (_host_id, _program_day, _current_hour, _program_day, _target, 0, 0, _bonus, _today, NULL)
  ON CONFLICT (host_id, program_day, hour_number) DO NOTHING;

  -- Atomic +1 with per-minute idempotency: only increments if no tick within last 50s.
  UPDATE new_host_live_bonus_progress
  SET minutes_accumulated = LEAST(minutes_accumulated + 1, _target),
      actual_minutes      = LEAST(COALESCE(actual_minutes, 0) + 1, _target),
      target_minutes      = _target,
      bonus_amount        = _bonus,
      last_minute_at      = now()
  WHERE host_id = _host_id
    AND program_day = _program_day
    AND hour_number = _current_hour
    AND (last_minute_at IS NULL OR last_minute_at < now() - interval '50 seconds');
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

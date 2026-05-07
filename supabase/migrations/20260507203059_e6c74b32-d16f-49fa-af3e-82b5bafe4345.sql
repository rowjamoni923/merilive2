ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS mission_bucket text NOT NULL DEFAULT 'daily';

ALTER TABLE public.daily_tasks
  DROP CONSTRAINT IF EXISTS daily_tasks_mission_bucket_check;

ALTER TABLE public.daily_tasks
  ADD CONSTRAINT daily_tasks_mission_bucket_check
  CHECK (mission_bucket IN ('daily', 'weekly', 'achievement'));

COMMENT ON COLUMN public.daily_tasks.mission_bucket IS 'daily: get_task_reset_date(); weekly: get_task_week_reset_date(); achievement: persistent (reset_date 1970-01-01).';

UPDATE public.daily_tasks
SET mission_bucket = 'achievement'
WHERE task_type = 'one_time';

UPDATE public.user_task_progress utp
SET reset_date = '1970-01-01', task_date = '1970-01-01'
FROM public.daily_tasks dt
WHERE utp.task_id = dt.id
  AND dt.task_type = 'one_time'
  AND utp.reset_date IS DISTINCT FROM '1970-01-01';

CREATE OR REPLACE FUNCTION public.get_task_reset_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN (now() AT TIME ZONE 'Europe/London')::time < '00:30:00'::time
    THEN ((now() AT TIME ZONE 'Europe/London')::date - interval '1 day')::date
    ELSE (now() AT TIME ZONE 'Europe/London')::date
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_task_week_reset_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  WITH d AS (SELECT public.get_task_reset_date() AS td)
  SELECT (td - (EXTRACT(DOW FROM td)::int) * interval '1 day')::date
  FROM d;
$$;

CREATE OR REPLACE FUNCTION public.get_task_center_calendar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _local_ts timestamp without time zone;
  _local_date date;
  _next_reset timestamptz;
BEGIN
  _local_ts := (now() AT TIME ZONE 'Europe/London');
  _local_date := _local_ts::date;

  IF _local_ts::time < '00:30:00'::time THEN
    _next_reset := (_local_date::text || ' 00:30:00')::timestamp AT TIME ZONE 'Europe/London';
  ELSE
    _next_reset := ((_local_date + 1)::text || ' 00:30:00')::timestamp AT TIME ZONE 'Europe/London';
  END IF;

  RETURN jsonb_build_object(
    'daily_date', to_char(get_task_reset_date(), 'YYYY-MM-DD'),
    'weekly_date', to_char(get_task_week_reset_date(), 'YYYY-MM-DD'),
    'achievement_reset', '1970-01-01',
    'next_reset_at', _next_reset
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_unclaimed_task_reward(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_task_progress utp
    INNER JOIN public.daily_tasks dt ON dt.id = utp.task_id AND dt.is_active = true
    WHERE utp.user_id = has_unclaimed_task_reward.uid
      AND has_unclaimed_task_reward.uid = auth.uid()
      AND COALESCE(utp.is_completed, false) = true
      AND COALESCE(utp.is_claimed, false) = false
      AND COALESCE(utp.reward_claimed, false) = false
      AND (
        (COALESCE(dt.mission_bucket, 'daily') = 'daily'
          AND utp.reset_date::text = to_char(public.get_task_reset_date(), 'YYYY-MM-DD'))
        OR (COALESCE(dt.mission_bucket, 'daily') = 'weekly'
          AND utp.reset_date::text = to_char(public.get_task_week_reset_date(), 'YYYY-MM-DD'))
        OR (COALESCE(dt.mission_bucket, 'daily') = 'achievement')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.update_task_progress(_task_type text, _value integer DEFAULT NULL, _increment integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _task RECORD;
  _reset date;
  _reset_key text;
  _new_progress integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  FOR _task IN
    SELECT id, requirement_value, COALESCE(mission_bucket, 'daily') AS mission_bucket
    FROM public.daily_tasks
    WHERE is_active = true
      AND requirement_type = _task_type
  LOOP
    _reset := CASE _task.mission_bucket
      WHEN 'weekly' THEN public.get_task_week_reset_date()
      WHEN 'achievement' THEN date '1970-01-01'
      ELSE public.get_task_reset_date()
    END;
    _reset_key := to_char(_reset, 'YYYY-MM-DD');

    INSERT INTO public.user_task_progress (
      user_id, task_id, current_count, current_progress, reset_date, task_date, is_completed, is_claimed
    )
    VALUES (_user_id, _task.id, 0, 0, _reset_key, _reset_key, false, false)
    ON CONFLICT (user_id, task_id, reset_date) DO NOTHING;

    IF _value IS NOT NULL THEN
      UPDATE public.user_task_progress
      SET current_count = GREATEST(current_count, _value),
          current_progress = GREATEST(COALESCE(current_progress, current_count, 0), _value),
          updated_at = now()
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _reset_key
      RETURNING current_count INTO _new_progress;
    ELSIF _increment IS NOT NULL THEN
      UPDATE public.user_task_progress
      SET current_count = current_count + _increment,
          current_progress = COALESCE(current_progress, current_count, 0) + _increment,
          updated_at = now()
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _reset_key
      RETURNING current_count INTO _new_progress;
    END IF;

    IF _new_progress IS NOT NULL AND _new_progress >= _task.requirement_value THEN
      UPDATE public.user_task_progress
      SET is_completed = true, completed_at = COALESCE(completed_at, now())
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _reset_key AND NOT COALESCE(is_completed, false);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

DROP FUNCTION IF EXISTS public.claim_task_reward(uuid, uuid);

CREATE OR REPLACE FUNCTION public.claim_task_reward(_user_id uuid, _task_id uuid, _task_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task RECORD;
  _progress RECORD;
  _expected_key text;
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

  SELECT * INTO _progress FROM public.user_task_progress
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _expected_key;

  IF NOT FOUND OR NOT COALESCE(_progress.is_completed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed', 'beans', 0, 'coins', 0);
  END IF;

  IF COALESCE(_progress.is_claimed, false) OR COALESCE(_progress.reward_claimed, false) THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_claimed', true,
      'beans', 0,
      'coins', 0,
      'beans_earned', 0,
      'coins_earned', 0
    );
  END IF;

  UPDATE public.user_task_progress
  SET is_claimed = true, reward_claimed = true
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _expected_key;

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
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_task_reward(_user_id uuid, _task_id uuid, _reset_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.claim_task_reward(_user_id, _task_id, _reset_date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_task_center_calendar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_unclaimed_task_reward(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_task_reward(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_task_reward(uuid, uuid, text) TO authenticated;
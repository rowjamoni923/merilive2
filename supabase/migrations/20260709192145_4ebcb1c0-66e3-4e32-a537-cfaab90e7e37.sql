
-- 1) Fix update_task_progress: drop is_claimed from INSERT (generated column)
CREATE OR REPLACE FUNCTION public.update_task_progress(_task_type text, _value integer DEFAULT NULL::integer, _increment integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _task RECORD;
  _reset date;
  _window_start timestamptz;
  _server_progress integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _task_type NOT IN (
    'first_live','live_minutes','viewers','first_gift','messages_sent',
    'followers','watch_live','send_gift','share_app'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown task type');
  END IF;

  FOR _task IN
    SELECT id, requirement_value, COALESCE(mission_bucket, 'daily') AS mission_bucket
    FROM public.daily_tasks
    WHERE is_active = true
      AND requirement_type = _task_type
  LOOP
    _reset := CASE _task.mission_bucket
      WHEN 'weekly'      THEN public.get_task_week_reset_date()
      WHEN 'achievement' THEN date '1970-01-01'
      ELSE public.get_task_reset_date()
    END;

    _window_start := ((_reset::timestamp + interval '30 minutes') AT TIME ZONE 'Europe/London');

    _server_progress := 0;

    IF _task_type = 'first_live' THEN
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.live_streams
        WHERE host_id = _user_id
          AND (COALESCE(started_at, created_at) >= _window_start)
      ) THEN 1 ELSE 0 END INTO _server_progress;

    ELSIF _task_type = 'live_minutes' THEN
      SELECT COALESCE(SUM(
        GREATEST(
          EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - COALESCE(started_at, created_at))) / 60.0,
          0
        )
      ), 0)::int INTO _server_progress
      FROM public.live_streams
      WHERE host_id = _user_id
        AND COALESCE(started_at, created_at) >= _window_start;

    ELSIF _task_type = 'viewers' THEN
      SELECT COALESCE(MAX(viewer_count), 0)::int INTO _server_progress
      FROM public.live_streams
      WHERE host_id = _user_id
        AND COALESCE(started_at, created_at) >= _window_start;

    ELSIF _task_type = 'first_gift' THEN
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.gift_transactions
        WHERE receiver_id = _user_id
          AND created_at >= _window_start
      ) THEN 1 ELSE 0 END INTO _server_progress;

    ELSIF _task_type = 'messages_sent' THEN
      SELECT COUNT(*)::int INTO _server_progress
      FROM public.messages
      WHERE sender_id = _user_id
        AND created_at >= _window_start;

    ELSIF _task_type = 'followers' THEN
      SELECT COUNT(*)::int INTO _server_progress
      FROM public.followers
      WHERE following_id = _user_id
        AND created_at >= _window_start;

    ELSIF _task_type = 'watch_live' THEN
      SELECT COUNT(DISTINCT stream_id)::int INTO _server_progress
      FROM public.stream_viewers
      WHERE viewer_id = _user_id
        AND COALESCE(joined_at, last_seen_at) >= _window_start;

    ELSIF _task_type = 'send_gift' THEN
      SELECT COUNT(*)::int INTO _server_progress
      FROM public.gift_transactions
      WHERE sender_id = _user_id
        AND created_at >= _window_start;

    ELSIF _task_type = 'share_app' THEN
      BEGIN
        INSERT INTO public.app_share_events (user_id, share_date)
        VALUES (_user_id, (_window_start AT TIME ZONE 'Europe/London')::date)
        ON CONFLICT (user_id, share_date) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      SELECT COUNT(*)::int INTO _server_progress
      FROM public.app_share_events
      WHERE user_id = _user_id
        AND created_at >= _window_start;
    END IF;

    -- NOTE: is_claimed is a GENERATED column (= reward_claimed) — must NOT appear here.
    INSERT INTO public.user_task_progress (
      user_id, task_id, current_count, current_progress,
      reset_date, task_date, is_completed, reward_claimed, updated_at
    )
    VALUES (
      _user_id, _task.id,
      _server_progress, _server_progress,
      _reset, _reset,
      _server_progress >= _task.requirement_value,
      false,
      now()
    )
    ON CONFLICT (user_id, task_id, reset_date) DO UPDATE
    SET current_count    = GREATEST(public.user_task_progress.current_count, EXCLUDED.current_count),
        current_progress = GREATEST(COALESCE(public.user_task_progress.current_progress,0), EXCLUDED.current_progress),
        is_completed     = public.user_task_progress.is_completed OR EXCLUDED.is_completed,
        completed_at     = CASE
                             WHEN EXCLUDED.is_completed AND public.user_task_progress.completed_at IS NULL
                               THEN now()
                             ELSE public.user_task_progress.completed_at
                           END,
        updated_at       = now();
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 2) Fix claim_task_reward: drop is_claimed writes (generated column).
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

  SELECT * INTO _progress
  FROM public.user_task_progress
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _expected_key::date
  FOR UPDATE;

  IF NOT FOUND OR NOT COALESCE(_progress.is_completed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed', 'beans', 0, 'coins', 0);
  END IF;

  IF COALESCE(_progress.reward_claimed, false) THEN
    RETURN jsonb_build_object(
      'success', true, 'already_claimed', true,
      'beans', 0, 'coins', 0, 'beans_earned', 0, 'coins_earned', 0
    );
  END IF;

  -- Only write reward_claimed; is_claimed is a generated mirror.
  UPDATE public.user_task_progress
  SET reward_claimed = true,
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE user_id = _user_id
    AND task_id = _task_id
    AND reset_date = _expected_key::date
    AND COALESCE(reward_claimed, false) = false;
  GET DIAGNOSTICS _claim_count = ROW_COUNT;

  IF _claim_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'already_claimed', true,
      'beans', 0, 'coins', 0, 'beans_earned', 0, 'coins_earned', 0
    );
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  IF COALESCE(_task.reward_beans, 0) > 0 THEN
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + _task.reward_beans WHERE id = _user_id;
  END IF;
  IF COALESCE(_task.reward_coins, 0) > 0 THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + _task.reward_coins WHERE id = _user_id;
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

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

-- 3) New Host Live Bonus — auto-accrue minutes on live_stream end
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
  -- Only when a stream transitions to ended
  IF NEW.ended_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.ended_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT created_at, COALESCE(is_host, false) INTO _host_created_at, _is_host
  FROM public.profiles WHERE id = NEW.host_id;
  IF NOT FOUND OR NOT _is_host THEN RETURN NEW; END IF;

  _program_day := GREATEST(1, (EXTRACT(DAY FROM (now() - _host_created_at))::int + 1));

  -- Cap program_day to the largest configured day
  SELECT COALESCE(MAX(day_number), 0) INTO _max_program_day
  FROM public.new_host_live_bonus_settings WHERE is_active = true;
  IF _max_program_day = 0 OR _program_day > _max_program_day THEN
    RETURN NEW;
  END IF;

  _stream_started := COALESCE(NEW.started_at, NEW.created_at);
  _stream_ended   := NEW.ended_at;
  _minutes := GREATEST(0, EXTRACT(EPOCH FROM (_stream_ended - _stream_started))::int / 60);
  IF _minutes = 0 THEN RETURN NEW; END IF;

  _remaining := _minutes;

  -- Distribute minutes across ordered hour slots for this program_day
  FOR _hour_row IN
    SELECT id, hour_number, target_minutes, bonus_beans, bonus_amount
    FROM public.new_host_live_bonus_settings
    WHERE is_active = true AND day_number = _program_day
    ORDER BY hour_number
  LOOP
    EXIT WHEN _remaining <= 0;

    SELECT COALESCE(actual_minutes, 0) INTO _existing_minutes
    FROM public.new_host_live_bonus_progress
    WHERE host_id = NEW.host_id
      AND program_day = _program_day
      AND hour_number = _hour_row.hour_number
      AND task_date = _reset_date
    FOR UPDATE;

    _existing_minutes := COALESCE(_existing_minutes, 0);
    IF _existing_minutes >= _hour_row.target_minutes THEN
      CONTINUE;
    END IF;

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
    ON CONFLICT (host_id, program_day, hour_number, task_date) DO UPDATE
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

-- unique constraint needed for ON CONFLICT above
CREATE UNIQUE INDEX IF NOT EXISTS ux_new_host_live_bonus_progress_slot
  ON public.new_host_live_bonus_progress (host_id, program_day, hour_number, task_date);

DROP TRIGGER IF EXISTS trg_sync_new_host_live_bonus_progress ON public.live_streams;
CREATE TRIGGER trg_sync_new_host_live_bonus_progress
AFTER INSERT OR UPDATE OF ended_at ON public.live_streams
FOR EACH ROW EXECUTE FUNCTION public.sync_new_host_live_bonus_progress();

-- 4) Backfill last 90 days of ended streams into progress table
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, host_id, started_at, created_at, ended_at
    FROM public.live_streams
    WHERE ended_at IS NOT NULL
      AND ended_at > now() - interval '90 days'
    ORDER BY ended_at ASC
  LOOP
    BEGIN
      PERFORM public.sync_new_host_live_bonus_progress_backfill(r.host_id, COALESCE(r.started_at, r.created_at), r.ended_at);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;

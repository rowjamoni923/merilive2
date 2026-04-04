-- Task Center critical hardening + one-time recovery (retry with trigger-safe data fix)

ALTER TABLE public.profiles DISABLE TRIGGER protect_sensitive_columns_trigger;
ALTER TABLE public.user_task_progress DISABLE TRIGGER protect_task_progress_trigger;

DO $$
DECLARE
  _protection_cutoff timestamptz := '2026-02-27T05:44:47Z';
BEGIN
  WITH invalid_events AS (
    SELECT
      utp.user_id,
      utp.task_id,
      utp.claimed_at,
      MAX(COALESCE(dt.reward_beans, 0)) AS reward_beans,
      MAX(COALESCE(dt.reward_coins, 0)) AS reward_diamonds
    FROM public.user_task_progress utp
    JOIN public.daily_tasks dt ON dt.id = utp.task_id
    WHERE utp.is_claimed = true
      AND COALESCE(utp.is_completed, false) = false
      AND utp.claimed_at IS NOT NULL
      AND utp.claimed_at < _protection_cutoff
    GROUP BY utp.user_id, utp.task_id, utp.claimed_at
  ),
  per_user AS (
    SELECT
      user_id,
      SUM(reward_beans)::bigint AS beans_to_revert,
      SUM(reward_diamonds)::bigint AS diamonds_to_revert
    FROM invalid_events
    GROUP BY user_id
  )
  UPDATE public.profiles p
  SET
    beans = GREATEST(COALESCE(p.beans, 0) - COALESCE(u.beans_to_revert, 0), 0),
    diamonds = GREATEST(COALESCE(p.diamonds, 0) - COALESCE(u.diamonds_to_revert, 0), 0),
    total_earnings = GREATEST(COALESCE(p.total_earnings, 0) - COALESCE(u.beans_to_revert, 0), 0)
  FROM per_user u
  WHERE p.id = u.user_id;

  UPDATE public.user_task_progress
  SET
    is_claimed = false,
    claimed_at = NULL,
    updated_at = now()
  WHERE is_claimed = true
    AND COALESCE(is_completed, false) = false;
END
$$;

ALTER TABLE public.user_task_progress ENABLE TRIGGER protect_task_progress_trigger;
ALTER TABLE public.profiles ENABLE TRIGGER protect_sensitive_columns_trigger;

DROP POLICY IF EXISTS "Users can insert own progress" ON public.user_task_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON public.user_task_progress;

CREATE OR REPLACE FUNCTION public.validate_user_task_progress_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_claimed, false) = true
     AND COALESCE(NEW.is_completed, false) = false THEN
    RAISE EXCEPTION 'Cannot claim reward for an incomplete task';
  END IF;

  IF COALESCE(NEW.is_claimed, false) = true AND NEW.claimed_at IS NULL THEN
    NEW.claimed_at := now();
  END IF;

  IF COALESCE(NEW.is_claimed, false) = false THEN
    NEW.claimed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_task_claim_state ON public.user_task_progress;
CREATE TRIGGER trg_validate_task_claim_state
BEFORE INSERT OR UPDATE ON public.user_task_progress
FOR EACH ROW
EXECUTE FUNCTION public.validate_user_task_progress_claim();

CREATE OR REPLACE FUNCTION public.claim_task_reward(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _user_id uuid;
  _today text;
  _progress RECORD;
  _task RECORD;
  _has_active_stream boolean;
  _is_host boolean;
  _new_host_level integer;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  _today := to_char((now() AT TIME ZONE 'UTC' - interval '30 minutes')::date, 'YYYY-MM-DD');

  SELECT *
  INTO _task
  FROM public.daily_tasks
  WHERE id = _task_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found');
  END IF;

  IF _task.requirement_type IN ('first_live', 'live_minutes', 'viewers', 'first_gift') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.live_streams
      WHERE host_id = _user_id
        AND is_active = true
        AND ended_at IS NULL
        AND created_at > now() - interval '24 hours'
    ) INTO _has_active_stream;

    IF NOT _has_active_stream THEN
      RETURN jsonb_build_object('success', false, 'error', 'No active live stream');
    END IF;
  END IF;

  SELECT *
  INTO _progress
  FROM public.user_task_progress
  WHERE user_id = _user_id
    AND task_id = _task_id
    AND reset_date = _today
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No progress found');
  END IF;

  IF NOT COALESCE(_progress.is_completed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed');
  END IF;

  UPDATE public.user_task_progress
  SET
    is_claimed = true,
    claimed_at = now(),
    updated_at = now()
  WHERE id = _progress.id
    AND COALESCE(is_claimed, false) = false
  RETURNING * INTO _progress;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;

  IF COALESCE(_task.reward_beans, 0) > 0 THEN
    UPDATE public.profiles
    SET beans = COALESCE(beans, 0) + _task.reward_beans
    WHERE id = _user_id;

    SELECT is_host INTO _is_host FROM public.profiles WHERE id = _user_id;
    IF _is_host = true THEN
      UPDATE public.profiles
      SET weekly_earnings = COALESCE(weekly_earnings, 0) + _task.reward_beans
      WHERE id = _user_id;
    END IF;
  END IF;

  IF COALESCE(_task.reward_coins, 0) > 0 THEN
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + _task.reward_coins
    WHERE id = _user_id;
  END IF;

  SELECT is_host INTO _is_host FROM public.profiles WHERE id = _user_id;
  IF _is_host = true THEN
    SELECT COALESCE(MAX(t.level_number), 0)
    INTO _new_host_level
    FROM public.user_level_tiers t
    WHERE t.tier_type = 'host'
      AND t.is_active = true
      AND t.min_earning_amount <= (
        SELECT COALESCE(weekly_earnings, 0) FROM public.profiles WHERE id = _user_id
      );

    UPDATE public.profiles
    SET host_level = _new_host_level
    WHERE id = _user_id
      AND COALESCE(host_level, 0) <> _new_host_level;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'beans', COALESCE(_task.reward_beans, 0),
    'coins', COALESCE(_task.reward_coins, 0)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_task_reward(uuid) TO authenticated;
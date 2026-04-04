-- Fix: Remove active stream check from claim_task_reward
-- The task progress was already validated during update_task_progress (which checks active stream)
-- Claiming should NOT require the host to still be live

CREATE OR REPLACE FUNCTION public.claim_task_reward(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _today text;
  _progress RECORD;
  _task RECORD;
  _is_host boolean;
  _new_host_level integer;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  _today := to_char((now() AT TIME ZONE 'UTC' - interval '30 minutes')::date, 'YYYY-MM-DD');

  -- Get task
  SELECT *
  INTO _task
  FROM public.daily_tasks
  WHERE id = _task_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found');
  END IF;

  -- Lock and get progress
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

  -- Claim (only if not already claimed)
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

  -- Add beans to profile
  IF COALESCE(_task.reward_beans, 0) > 0 THEN
    UPDATE public.profiles
    SET beans = COALESCE(beans, 0) + _task.reward_beans
    WHERE id = _user_id;

    -- Update weekly earnings for hosts
    SELECT is_host INTO _is_host FROM public.profiles WHERE id = _user_id;
    IF _is_host = true THEN
      UPDATE public.profiles
      SET weekly_earnings = COALESCE(weekly_earnings, 0) + _task.reward_beans
      WHERE id = _user_id;
    END IF;
  END IF;

  -- Add coins/diamonds
  IF COALESCE(_task.reward_coins, 0) > 0 THEN
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + _task.reward_coins
    WHERE id = _user_id;
  END IF;

  -- Recalculate host level
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
$$;
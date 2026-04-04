
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
  _has_active_stream boolean;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  _today := to_char((now() AT TIME ZONE 'UTC' - interval '30 minutes')::date, 'YYYY-MM-DD');

  SELECT * INTO _task FROM daily_tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found');
  END IF;

  IF _task.requirement_type IN ('first_live', 'live_minutes', 'viewers', 'first_gift') THEN
    SELECT EXISTS(
      SELECT 1 FROM live_streams 
      WHERE host_id = _user_id AND is_active = true AND ended_at IS NULL
        AND created_at > now() - interval '24 hours'
    ) INTO _has_active_stream;

    IF NOT _has_active_stream THEN
      RETURN jsonb_build_object('success', false, 'error', 'No active live stream');
    END IF;
  END IF;

  SELECT * INTO _progress FROM user_task_progress
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _today;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No progress found');
  END IF;

  IF NOT _progress.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed');
  END IF;

  IF _progress.is_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;

  UPDATE user_task_progress
  SET is_claimed = true, claimed_at = now()
  WHERE id = _progress.id;

  IF COALESCE(_task.reward_beans, 0) > 0 THEN
    UPDATE profiles SET beans = COALESCE(beans, 0) + _task.reward_beans WHERE id = _user_id;
  END IF;

  IF COALESCE(_task.reward_coins, 0) > 0 THEN
    UPDATE profiles SET coins = COALESCE(coins, 0) + _task.reward_coins WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'beans', COALESCE(_task.reward_beans, 0), 
    'coins', COALESCE(_task.reward_coins, 0)
  );
END;
$$;

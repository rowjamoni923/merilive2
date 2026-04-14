CREATE OR REPLACE FUNCTION public.claim_task_reward(
  _user_id uuid,
  _task_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task RECORD;
  _progress RECORD;
  _today text := CURRENT_DATE::text;
BEGIN
  -- Get task details
  SELECT * INTO _task FROM daily_tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found');
  END IF;

  -- Get progress
  SELECT * INTO _progress FROM user_task_progress 
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _today;
  
  IF NOT FOUND OR NOT _progress.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed');
  END IF;

  IF _progress.is_claimed OR _progress.reward_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;

  -- Mark claimed
  UPDATE user_task_progress 
  SET is_claimed = true, reward_claimed = true
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _today;

  -- Award beans
  IF COALESCE(_task.reward_beans, 0) > 0 THEN
    UPDATE profiles SET beans = COALESCE(beans, 0) + _task.reward_beans WHERE id = _user_id;
  END IF;

  -- Award coins/diamonds
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
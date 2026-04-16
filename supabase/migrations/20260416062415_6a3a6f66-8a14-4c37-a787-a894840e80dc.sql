
-- Helper function: get task reset date (12:30 AM BST = UTC+6)
CREATE OR REPLACE FUNCTION public.get_task_reset_date()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN (now() AT TIME ZONE 'Asia/Dhaka')::time < '00:30:00'::time
    THEN ((now() AT TIME ZONE 'Asia/Dhaka')::date - interval '1 day')::date
    ELSE (now() AT TIME ZONE 'Asia/Dhaka')::date
  END;
$$;

-- =============================================
-- 1. get_daily_task_progress RPC (native app)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_daily_task_progress(_user_id uuid, _reset_date text)
RETURNS TABLE(task_id uuid, current_progress int, is_completed boolean, is_claimed boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    utp.task_id,
    COALESCE(utp.current_progress, utp.current_count, 0) AS current_progress,
    COALESCE(utp.is_completed, false) AS is_completed,
    COALESCE(utp.is_claimed, utp.reward_claimed, false) AS is_claimed
  FROM user_task_progress utp
  WHERE utp.user_id = _user_id
    AND utp.reset_date = _reset_date::date;
END;
$$;

-- =============================================
-- 2. claim_daily_task_reward RPC (native app)
-- =============================================
CREATE OR REPLACE FUNCTION public.claim_daily_task_reward(_user_id uuid, _task_id uuid, _reset_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _task RECORD;
  _progress RECORD;
  _effective_date date;
BEGIN
  -- Use provided reset_date or calculate BST 12:30 AM reset
  IF _reset_date IS NOT NULL THEN
    _effective_date := _reset_date::date;
  ELSE
    _effective_date := get_task_reset_date();
  END IF;

  -- Get task details
  SELECT * INTO _task FROM daily_tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found', 'beans_earned', 0, 'coins_earned', 0);
  END IF;

  -- Get progress
  SELECT * INTO _progress FROM user_task_progress 
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _effective_date;
  
  IF NOT FOUND OR NOT COALESCE(_progress.is_completed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed', 'beans_earned', 0, 'coins_earned', 0);
  END IF;

  IF COALESCE(_progress.is_claimed, false) OR COALESCE(_progress.reward_claimed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed', 'beans_earned', 0, 'coins_earned', 0);
  END IF;

  -- Mark claimed
  UPDATE user_task_progress 
  SET is_claimed = true, reward_claimed = true
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _effective_date;

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
    'beans_earned', COALESCE(_task.reward_beans, 0), 
    'coins_earned', COALESCE(_task.reward_coins, 0)
  );
END;
$$;

-- =============================================
-- 3. Fix claim_task_reward to use BST reset date
-- =============================================
CREATE OR REPLACE FUNCTION public.claim_task_reward(_user_id uuid, _task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _task RECORD;
  _progress RECORD;
  _today date;
BEGIN
  -- Use BST 12:30 AM reset date instead of raw CURRENT_DATE
  _today := get_task_reset_date();

  SELECT * INTO _task FROM daily_tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found');
  END IF;

  SELECT * INTO _progress FROM user_task_progress 
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _today;
  
  IF NOT FOUND OR NOT COALESCE(_progress.is_completed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed');
  END IF;

  IF COALESCE(_progress.is_claimed, false) OR COALESCE(_progress.reward_claimed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;

  UPDATE user_task_progress 
  SET is_claimed = true, reward_claimed = true
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _today;

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

-- =============================================
-- 4. Fix update_task_progress to use BST reset date
-- =============================================
CREATE OR REPLACE FUNCTION public.update_task_progress(_task_type text, _value integer DEFAULT NULL, _increment integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _task RECORD;
  _today date;
  _new_progress integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Use BST 12:30 AM reset date
  _today := get_task_reset_date();

  FOR _task IN 
    SELECT id, requirement_value 
    FROM daily_tasks 
    WHERE is_active = true 
      AND requirement_type = _task_type
  LOOP
    INSERT INTO user_task_progress (user_id, task_id, current_count, current_progress, reset_date, task_date, is_completed, is_claimed)
    VALUES (_user_id, _task.id, 0, 0, _today, _today, false, false)
    ON CONFLICT (user_id, task_id, reset_date) DO NOTHING;

    IF _value IS NOT NULL THEN
      UPDATE user_task_progress 
      SET current_count = GREATEST(current_count, _value),
          current_progress = GREATEST(current_progress, _value),
          updated_at = now()
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _today
      RETURNING current_count INTO _new_progress;
    ELSIF _increment IS NOT NULL THEN
      UPDATE user_task_progress 
      SET current_count = current_count + _increment,
          current_progress = current_progress + _increment,
          updated_at = now()
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _today
      RETURNING current_count INTO _new_progress;
    END IF;

    IF _new_progress >= _task.requirement_value THEN
      UPDATE user_task_progress 
      SET is_completed = true, completed_at = COALESCE(completed_at, now())
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _today AND NOT is_completed;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- =============================================
-- 5. get_leaderboard RPC (native app generic)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_leaderboard(_period text)
RETURNS TABLE(
  rank int,
  user_id uuid,
  display_name text,
  avatar_url text,
  stat_value bigint,
  level int,
  country_flag text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _start timestamptz;
BEGIN
  -- Calculate period start
  IF _period = 'daily' THEN
    _start := date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka';
  ELSIF _period = 'weekly' THEN
    _start := date_trunc('week', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka';
  ELSIF _period = 'monthly' THEN
    _start := date_trunc('month', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka';
  ELSE
    _start := date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka';
  END IF;

  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(gt.coin_amount) DESC)::int AS rank,
    gt.receiver_id AS user_id,
    p.display_name,
    p.avatar_url,
    SUM(gt.coin_amount)::bigint AS stat_value,
    COALESCE(p.host_level, p.user_level, 1) AS level,
    p.country_flag
  FROM gift_transactions gt
  JOIN profiles p ON p.id = gt.receiver_id
  WHERE gt.created_at >= _start
    AND gt.coin_amount > 0
  GROUP BY gt.receiver_id, p.display_name, p.avatar_url, p.host_level, p.user_level, p.country_flag
  ORDER BY stat_value DESC
  LIMIT 100;
END;
$$;

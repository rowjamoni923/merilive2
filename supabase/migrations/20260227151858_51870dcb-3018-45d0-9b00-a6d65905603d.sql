
-- 1. Fix claim_task_reward: Add task reward beans to weekly_earnings for hosts
CREATE OR REPLACE FUNCTION public.claim_task_reward(_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    
    -- CRITICAL: Also add to weekly_earnings for host level calculation
    SELECT is_host INTO _is_host FROM profiles WHERE id = _user_id;
    IF _is_host = true THEN
      UPDATE profiles 
      SET weekly_earnings = COALESCE(weekly_earnings, 0) + _task.reward_beans
      WHERE id = _user_id;
    END IF;
  END IF;

  IF COALESCE(_task.reward_coins, 0) > 0 THEN
    UPDATE profiles SET coins = COALESCE(coins, 0) + _task.reward_coins WHERE id = _user_id;
  END IF;

  -- Auto-recalculate host level after reward
  SELECT is_host INTO _is_host FROM profiles WHERE id = _user_id;
  IF _is_host = true THEN
    SELECT COALESCE(MAX(t.level_number), 0) INTO _new_host_level
    FROM user_level_tiers t
    WHERE t.tier_type = 'host' 
      AND t.is_active = true
      AND t.min_earning_amount <= (SELECT COALESCE(weekly_earnings, 0) FROM profiles WHERE id = _user_id);
    
    UPDATE profiles SET host_level = _new_host_level WHERE id = _user_id AND COALESCE(host_level, 0) <> _new_host_level;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'beans', COALESCE(_task.reward_beans, 0), 
    'coins', COALESCE(_task.reward_coins, 0)
  );
END;
$function$;

-- 2. Create trigger to auto-recalculate host_level whenever weekly_earnings changes
CREATE OR REPLACE FUNCTION public.auto_recalc_host_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_level integer;
BEGIN
  -- Only for hosts when weekly_earnings changes
  IF NEW.is_host = true AND COALESCE(NEW.weekly_earnings, 0) IS DISTINCT FROM COALESCE(OLD.weekly_earnings, 0) THEN
    SELECT COALESCE(MAX(t.level_number), 0) INTO _new_level
    FROM user_level_tiers t
    WHERE t.tier_type = 'host'
      AND t.is_active = true
      AND t.min_earning_amount <= COALESCE(NEW.weekly_earnings, 0);
    
    -- Use previous level logic: never show lower than previous
    _new_level := GREATEST(_new_level, COALESCE(NEW.previous_host_level, 0));
    
    NEW.host_level := _new_level;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS trg_auto_recalc_host_level ON profiles;
CREATE TRIGGER trg_auto_recalc_host_level
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalc_host_level();

-- 3. Now fix all existing hosts whose host_level doesn't match their weekly_earnings
-- This is a one-time data fix
DO $$
DECLARE
  _host RECORD;
  _correct_level integer;
BEGIN
  FOR _host IN 
    SELECT p.id, p.weekly_earnings, p.host_level, p.previous_host_level
    FROM profiles p
    WHERE p.is_host = true AND COALESCE(p.weekly_earnings, 0) > 0
  LOOP
    SELECT COALESCE(MAX(t.level_number), 0) INTO _correct_level
    FROM user_level_tiers t
    WHERE t.tier_type = 'host'
      AND t.is_active = true
      AND t.min_earning_amount <= COALESCE(_host.weekly_earnings, 0);
    
    -- Apply previous level preservation
    _correct_level := GREATEST(_correct_level, COALESCE(_host.previous_host_level, 0));
    
    IF COALESCE(_host.host_level, 0) <> _correct_level THEN
      UPDATE profiles SET host_level = _correct_level WHERE id = _host.id;
    END IF;
  END LOOP;
END $$;


-- Temporarily disable the protection trigger for data fix
ALTER TABLE profiles DISABLE TRIGGER protect_sensitive_columns_trigger;

-- Fix missed task reward beans - add to weekly_earnings
DO $$
DECLARE
  _host RECORD;
  _new_level integer;
BEGIN
  FOR _host IN
    SELECT utp.user_id, SUM(dt.reward_beans) as total_missed_beans
    FROM user_task_progress utp
    JOIN daily_tasks dt ON dt.id = utp.task_id
    JOIN profiles p ON p.id = utp.user_id AND p.is_host = true
    WHERE utp.is_claimed = true AND dt.reward_beans > 0
    GROUP BY utp.user_id
  LOOP
    UPDATE profiles 
    SET weekly_earnings = COALESCE(weekly_earnings, 0) + _host.total_missed_beans
    WHERE id = _host.user_id;
  END LOOP;
END $$;

-- Now recalculate host_level for all hosts based on corrected weekly_earnings
DO $$
DECLARE
  _host RECORD;
  _new_level integer;
BEGIN
  FOR _host IN
    SELECT id, weekly_earnings, previous_host_level, host_level
    FROM profiles WHERE is_host = true AND COALESCE(weekly_earnings, 0) > 0
  LOOP
    SELECT COALESCE(MAX(t.level_number), 0) INTO _new_level
    FROM user_level_tiers t
    WHERE t.tier_type = 'host' AND t.is_active = true
      AND t.min_earning_amount <= COALESCE(_host.weekly_earnings, 0);
    
    _new_level := GREATEST(_new_level, COALESCE(_host.previous_host_level, 0));
    
    IF COALESCE(_host.host_level, 0) <> _new_level THEN
      UPDATE profiles SET host_level = _new_level WHERE id = _host.id;
    END IF;
  END LOOP;
END $$;

-- Re-enable the protection trigger
ALTER TABLE profiles ENABLE TRIGGER protect_sensitive_columns_trigger;

-- Clean up the one-time function if it was created
DROP FUNCTION IF EXISTS fix_missed_task_reward_earnings();

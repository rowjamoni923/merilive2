
-- Retroactively credit missing beans from task rewards
-- These users claimed rewards but beans only went to total_earnings, not beans column
UPDATE profiles p
SET beans = COALESCE(p.beans, 0) + claimed.total_claimed_beans
FROM (
  SELECT 
    utp.user_id,
    SUM(dt.reward_beans) as total_claimed_beans
  FROM user_task_progress utp
  JOIN daily_tasks dt ON dt.id = utp.task_id
  WHERE utp.is_claimed = true AND dt.reward_beans > 0
  GROUP BY utp.user_id
) claimed
WHERE p.id = claimed.user_id;

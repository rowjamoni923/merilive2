ALTER TABLE user_task_progress REPLICA IDENTITY FULL;
ALTER TABLE user_task_progress ADD COLUMN IF NOT EXISTS current_progress integer DEFAULT 0;
UPDATE user_task_progress SET current_progress = current_count WHERE current_progress = 0 AND current_count IS NOT NULL AND current_count > 0;
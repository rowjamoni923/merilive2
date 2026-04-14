ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS requirement_type text DEFAULT 'first_live';
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS requirement_value integer DEFAULT 1;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS reward_beans integer DEFAULT 0;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS icon_color text DEFAULT '#FFB800';
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS target_audience text DEFAULT 'all';
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS duration_hours integer DEFAULT 24;
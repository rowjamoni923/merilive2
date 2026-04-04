
-- Add target_audience column to daily_tasks table
-- 'all' = visible to everyone, 'host' = only hosts, 'user' = only regular users
ALTER TABLE public.daily_tasks 
ADD COLUMN IF NOT EXISTS target_audience text NOT NULL DEFAULT 'all';

-- Update existing live tasks to be host-only
UPDATE public.daily_tasks 
SET target_audience = 'host' 
WHERE task_type = 'live_hours' OR requirement_type = 'live_minutes';

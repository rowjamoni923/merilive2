-- Add duration_hours column to daily_tasks for task time control
ALTER TABLE public.daily_tasks 
ADD COLUMN IF NOT EXISTS duration_hours integer DEFAULT 24;

-- Add comment
COMMENT ON COLUMN public.daily_tasks.duration_hours IS 'Task duration in hours - admin can increase/decrease this';

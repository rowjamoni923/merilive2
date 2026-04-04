
-- Add show_in_live column to daily_tasks
ALTER TABLE public.daily_tasks ADD COLUMN IF NOT EXISTS show_in_live boolean DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.daily_tasks.show_in_live IS 'Whether this task should be shown inside the live stream view';

-- Fix: Add helper_processed_at to agency_withdrawals
ALTER TABLE public.agency_withdrawals
  ADD COLUMN IF NOT EXISTS helper_processed_at timestamptz;

-- Fix: Add level_number to helper_level_config (mapped from existing 'level' column)
ALTER TABLE public.helper_level_config
  ADD COLUMN IF NOT EXISTS level_number integer GENERATED ALWAYS AS (level) STORED;

-- Fix: Add reset_date to user_task_progress
ALTER TABLE public.user_task_progress
  ADD COLUMN IF NOT EXISTS reset_date date DEFAULT CURRENT_DATE;
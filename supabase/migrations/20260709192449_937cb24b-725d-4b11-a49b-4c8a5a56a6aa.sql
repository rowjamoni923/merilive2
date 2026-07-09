
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_task_progress_user_task_reset
  ON public.user_task_progress (user_id, task_id, reset_date);

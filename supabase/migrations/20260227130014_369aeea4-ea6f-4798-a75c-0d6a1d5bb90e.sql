
CREATE OR REPLACE FUNCTION public.upsert_user_task_progress(
  p_user_id UUID,
  p_task_id TEXT,
  p_reset_date TEXT,
  p_progress INTEGER DEFAULT 1,
  p_is_completed BOOLEAN DEFAULT FALSE,
  p_is_claimed BOOLEAN DEFAULT FALSE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_task_progress (user_id, task_id, reset_date, progress, is_completed, is_claimed)
  VALUES (p_user_id, p_task_id, p_reset_date, p_progress, p_is_completed, p_is_claimed)
  ON CONFLICT (user_id, task_id, reset_date) 
  DO UPDATE SET 
    progress = EXCLUDED.progress,
    is_completed = EXCLUDED.is_completed,
    is_claimed = EXCLUDED.is_claimed,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_user_task_progress TO authenticated;

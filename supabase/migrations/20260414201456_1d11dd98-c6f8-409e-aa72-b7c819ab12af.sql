CREATE OR REPLACE FUNCTION public.update_task_progress(
  _task_type text,
  _value integer DEFAULT NULL,
  _increment integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _task RECORD;
  _today date;
  _new_progress integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  _today := CURRENT_DATE;

  FOR _task IN 
    SELECT id, requirement_value 
    FROM daily_tasks 
    WHERE is_active = true 
      AND requirement_type = _task_type
  LOOP
    -- Upsert progress
    INSERT INTO user_task_progress (user_id, task_id, current_count, current_progress, reset_date, task_date, is_completed, is_claimed)
    VALUES (_user_id, _task.id, 0, 0, _today::text, _today, false, false)
    ON CONFLICT (user_id, task_id, reset_date) DO NOTHING;

    -- Calculate new progress
    IF _value IS NOT NULL THEN
      UPDATE user_task_progress 
      SET current_count = GREATEST(current_count, _value),
          current_progress = GREATEST(current_progress, _value),
          updated_at = now()
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _today::text
      RETURNING current_count INTO _new_progress;
    ELSIF _increment IS NOT NULL THEN
      UPDATE user_task_progress 
      SET current_count = current_count + _increment,
          current_progress = current_progress + _increment,
          updated_at = now()
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _today::text
      RETURNING current_count INTO _new_progress;
    END IF;

    -- Check completion
    IF _new_progress >= _task.requirement_value THEN
      UPDATE user_task_progress 
      SET is_completed = true, completed_at = COALESCE(completed_at, now())
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _today::text AND NOT is_completed;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;
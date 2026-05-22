CREATE OR REPLACE FUNCTION public.update_task_progress(_task_type text, _value integer DEFAULT NULL::integer, _increment integer DEFAULT NULL::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _task RECORD;
  _reset date;
  _new_progress integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  FOR _task IN
    SELECT id, requirement_value, COALESCE(mission_bucket, 'daily') AS mission_bucket
    FROM public.daily_tasks
    WHERE is_active = true
      AND requirement_type = _task_type
  LOOP
    _new_progress := NULL;

    _reset := CASE _task.mission_bucket
      WHEN 'weekly' THEN public.get_task_week_reset_date()
      WHEN 'achievement' THEN date '1970-01-01'
      ELSE public.get_task_reset_date()
    END;

    INSERT INTO public.user_task_progress (
      user_id, task_id, current_count, current_progress, reset_date, task_date, is_completed, is_claimed
    )
    VALUES (_user_id, _task.id, 0, 0, _reset, _reset, false, false)
    ON CONFLICT (user_id, task_id, reset_date) DO NOTHING;

    IF _value IS NOT NULL THEN
      UPDATE public.user_task_progress
      SET current_count = GREATEST(current_count, _value),
          current_progress = GREATEST(COALESCE(current_progress, current_count, 0), _value),
          updated_at = now()
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _reset
      RETURNING current_count INTO _new_progress;
    ELSIF _increment IS NOT NULL THEN
      UPDATE public.user_task_progress
      SET current_count = current_count + _increment,
          current_progress = COALESCE(current_progress, current_count, 0) + _increment,
          updated_at = now()
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _reset
      RETURNING current_count INTO _new_progress;
    END IF;

    IF _new_progress IS NOT NULL AND _new_progress >= _task.requirement_value THEN
      UPDATE public.user_task_progress
      SET is_completed = true, completed_at = COALESCE(completed_at, now())
      WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _reset AND NOT COALESCE(is_completed, false);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;
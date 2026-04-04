
-- SECURITY: Create a SECURITY DEFINER function for task progress updates
-- This replaces direct client-side inserts/updates to user_task_progress

CREATE OR REPLACE FUNCTION public.update_task_progress(
  _task_type text,
  _value integer DEFAULT NULL,
  _increment integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _today text;
  _task RECORD;
  _existing RECORD;
  _new_progress integer;
  _is_completed boolean;
  _is_host boolean;
  _has_active_stream boolean;
  _results jsonb := '[]'::jsonb;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Calculate today's task date (using 00:30 boundary like the app)
  _today := to_char((now() AT TIME ZONE 'UTC' - interval '30 minutes')::date, 'YYYY-MM-DD');

  -- For live-related tasks, VERIFY the user actually has an active live stream
  IF _task_type IN ('first_live', 'live_minutes', 'viewers', 'first_gift') THEN
    SELECT is_host INTO _is_host FROM profiles WHERE id = _user_id;
    
    IF NOT COALESCE(_is_host, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not a host');
    END IF;

    -- Check for ACTIVE live stream (not ended)
    SELECT EXISTS(
      SELECT 1 FROM live_streams 
      WHERE host_id = _user_id 
        AND is_active = true 
        AND ended_at IS NULL
        AND created_at > now() - interval '24 hours'
    ) INTO _has_active_stream;

    IF NOT _has_active_stream THEN
      RETURN jsonb_build_object('success', false, 'error', 'No active live stream');
    END IF;
  END IF;

  -- Process each matching task
  FOR _task IN 
    SELECT id, requirement_value FROM daily_tasks 
    WHERE requirement_type = _task_type AND is_active = true
  LOOP
    -- Get existing progress
    SELECT * INTO _existing FROM user_task_progress
    WHERE user_id = _user_id AND task_id = _task.id AND reset_date = _today;

    IF _existing IS NOT NULL THEN
      -- Skip if already claimed
      IF _existing.is_claimed THEN
        CONTINUE;
      END IF;

      -- Calculate new progress
      IF _value IS NOT NULL THEN
        _new_progress := GREATEST(COALESCE(_existing.current_progress, 0), _value);
      ELSIF _increment IS NOT NULL THEN
        _new_progress := COALESCE(_existing.current_progress, 0) + _increment;
      ELSE
        _new_progress := COALESCE(_existing.current_progress, 0) + 1;
      END IF;

      _is_completed := _new_progress >= _task.requirement_value;

      UPDATE user_task_progress
      SET current_progress = _new_progress, is_completed = _is_completed, updated_at = now()
      WHERE id = _existing.id;
    ELSE
      -- Create new record
      IF _value IS NOT NULL THEN
        _new_progress := _value;
      ELSIF _increment IS NOT NULL THEN
        _new_progress := _increment;
      ELSE
        _new_progress := 1;
      END IF;

      _is_completed := _new_progress >= _task.requirement_value;

      INSERT INTO user_task_progress (user_id, task_id, reset_date, current_progress, is_completed)
      VALUES (_user_id, _task.id, _today, _new_progress, _is_completed);
    END IF;

    _results := _results || jsonb_build_object('task_id', _task.id, 'progress', _new_progress, 'completed', _is_completed);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'tasks', _results);
END;
$$;

-- Now restrict direct INSERT/UPDATE on user_task_progress
-- Remove permissive policies
DROP POLICY IF EXISTS "Users can insert own progress" ON user_task_progress;
DROP POLICY IF EXISTS "Users can update own progress" ON user_task_progress;

-- Only allow inserts/updates through the SECURITY DEFINER function
-- Keep SELECT so users can view their own progress
-- The SECURITY DEFINER function handles all writes

-- Add a trigger to block direct writes (same pattern as profiles protection)
CREATE OR REPLACE FUNCTION public.protect_task_progress_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow if inside a SECURITY DEFINER function context
  IF current_user IS DISTINCT FROM session_user THEN
    RETURN NEW;
  END IF;

  -- Block direct writes from authenticated users
  RAISE EXCEPTION 'Direct modification of task progress is not allowed. Use the update_task_progress function.';
END;
$$;

DROP TRIGGER IF EXISTS protect_task_progress_trigger ON user_task_progress;
CREATE TRIGGER protect_task_progress_trigger
  BEFORE INSERT OR UPDATE ON user_task_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_task_progress_writes();

-- Re-add insert/update policies (needed for the SECURITY DEFINER function context)
CREATE POLICY "Users can insert own progress"
  ON user_task_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON user_task_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

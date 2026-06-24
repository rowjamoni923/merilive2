-- 1) Small audit table for "Share App" taps (1 per user per day counts)
CREATE TABLE IF NOT EXISTS public.app_share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  share_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/London')::date,
  channel text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_share_events_user_day_uidx
  ON public.app_share_events(user_id, share_date);

GRANT SELECT, INSERT ON public.app_share_events TO authenticated;
GRANT ALL ON public.app_share_events TO service_role;

ALTER TABLE public.app_share_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own share events"
  ON public.app_share_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own share events"
  ON public.app_share_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2) Extend update_task_progress to handle the 4 missing types
CREATE OR REPLACE FUNCTION public.update_task_progress(
  _task_type text,
  _value integer DEFAULT NULL::integer,
  _increment integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _task RECORD;
  _reset date;
  _window_start timestamptz;
  _window_end   timestamptz;
  _server_progress integer;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _task_type NOT IN (
    'first_live','live_minutes','viewers','first_gift','messages_sent',
    'followers','watch_live','send_gift','share_app'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unknown task type');
  END IF;

  FOR _task IN
    SELECT id, requirement_value, COALESCE(mission_bucket, 'daily') AS mission_bucket
    FROM public.daily_tasks
    WHERE is_active = true
      AND requirement_type = _task_type
  LOOP
    _reset := CASE _task.mission_bucket
      WHEN 'weekly'      THEN public.get_task_week_reset_date()
      WHEN 'achievement' THEN date '1970-01-01'
      ELSE public.get_task_reset_date()
    END;

    _window_start := ((_reset::timestamp + interval '30 minutes') AT TIME ZONE 'Europe/London');
    _window_end   := now() + interval '1 minute';

    _server_progress := 0;

    IF _task_type = 'first_live' THEN
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.live_streams
        WHERE host_id = _user_id
          AND (COALESCE(started_at, created_at) >= _window_start)
      ) THEN 1 ELSE 0 END INTO _server_progress;

    ELSIF _task_type = 'live_minutes' THEN
      SELECT COALESCE(SUM(
        GREATEST(
          EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - COALESCE(started_at, created_at))) / 60.0,
          0
        )
      ), 0)::int INTO _server_progress
      FROM public.live_streams
      WHERE host_id = _user_id
        AND COALESCE(started_at, created_at) >= _window_start;

    ELSIF _task_type = 'viewers' THEN
      SELECT COALESCE(MAX(viewer_count), 0)::int INTO _server_progress
      FROM public.live_streams
      WHERE host_id = _user_id
        AND COALESCE(started_at, created_at) >= _window_start;

    ELSIF _task_type = 'first_gift' THEN
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM public.gift_transactions
        WHERE receiver_id = _user_id
          AND created_at >= _window_start
      ) THEN 1 ELSE 0 END INTO _server_progress;

    ELSIF _task_type = 'messages_sent' THEN
      SELECT COUNT(*)::int INTO _server_progress
      FROM public.messages
      WHERE sender_id = _user_id
        AND created_at >= _window_start;

    -- NEW: followers gained since reset
    ELSIF _task_type = 'followers' THEN
      SELECT COUNT(*)::int INTO _server_progress
      FROM public.followers
      WHERE following_id = _user_id
        AND created_at >= _window_start;

    -- NEW: distinct live streams the user has watched since reset
    ELSIF _task_type = 'watch_live' THEN
      SELECT COUNT(DISTINCT stream_id)::int INTO _server_progress
      FROM public.stream_viewers
      WHERE viewer_id = _user_id
        AND COALESCE(joined_at, last_seen_at) >= _window_start;

    -- NEW: gifts the user has sent since reset
    ELSIF _task_type = 'send_gift' THEN
      SELECT COUNT(*)::int INTO _server_progress
      FROM public.gift_transactions
      WHERE sender_id = _user_id
        AND created_at >= _window_start;

    -- NEW: share-app taps (1 per day per user, idempotent insert)
    ELSIF _task_type = 'share_app' THEN
      BEGIN
        INSERT INTO public.app_share_events (user_id, share_date)
        VALUES (_user_id, (_window_start AT TIME ZONE 'Europe/London')::date)
        ON CONFLICT (user_id, share_date) DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        -- never fail the RPC just because the share log failed
        NULL;
      END;
      SELECT COUNT(*)::int INTO _server_progress
      FROM public.app_share_events
      WHERE user_id = _user_id
        AND created_at >= _window_start;
    END IF;

    INSERT INTO public.user_task_progress (
      user_id, task_id, current_count, current_progress,
      reset_date, task_date, is_completed, is_claimed, updated_at
    )
    VALUES (
      _user_id, _task.id,
      _server_progress, _server_progress,
      _reset, _reset,
      _server_progress >= _task.requirement_value,
      false,
      now()
    )
    ON CONFLICT (user_id, task_id, reset_date) DO UPDATE
    SET current_count    = GREATEST(public.user_task_progress.current_count, EXCLUDED.current_count),
        current_progress = GREATEST(COALESCE(public.user_task_progress.current_progress,0), EXCLUDED.current_progress),
        is_completed     = public.user_task_progress.is_completed OR EXCLUDED.is_completed,
        completed_at     = CASE
                             WHEN EXCLUDED.is_completed AND public.user_task_progress.completed_at IS NULL
                               THEN now()
                             ELSE public.user_task_progress.completed_at
                           END,
        updated_at       = now();
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$function$;
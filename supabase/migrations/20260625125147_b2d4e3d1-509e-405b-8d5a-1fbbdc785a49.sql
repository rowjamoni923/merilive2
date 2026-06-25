
-- =========================================================================
-- RANDOM MATCH CALL PHASE A — Chamet-tier P0 gap closure
-- =========================================================================

-- ---------- G1: Gender filter enforcement ----------
ALTER TABLE public.host_match_preferences
  ADD COLUMN IF NOT EXISTS preferred_caller_gender text NOT NULL DEFAULT 'any'
    CHECK (preferred_caller_gender IN ('any','male','female'));

CREATE INDEX IF NOT EXISTS idx_hmp_gender_pool
  ON public.host_match_preferences (is_in_match_pool, preferred_caller_gender)
  WHERE is_in_match_pool = true;

ALTER TABLE public.random_call_queue
  ADD COLUMN IF NOT EXISTS caller_gender text;

-- ---------- G2: Preview hardening ----------
ALTER TABLE public.random_call_queue
  ADD COLUMN IF NOT EXISTS preview_started_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_heartbeat_at  timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_rcq_heartbeat
  ON public.random_call_queue (last_heartbeat_at);

CREATE OR REPLACE FUNCTION public.cleanup_stale_random_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer;
BEGIN
  WITH del AS (
    DELETE FROM public.random_call_queue
    WHERE last_heartbeat_at < now() - interval '90 seconds'
       OR (status = 'waiting' AND entered_at < now() - interval '5 minutes')
    RETURNING id
  )
  SELECT count(*) INTO removed FROM del;
  RETURN removed;
END;
$$;

CREATE OR REPLACE FUNCTION public.random_queue_heartbeat(_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.random_call_queue
     SET last_heartbeat_at = now(), updated_at = now()
   WHERE user_id = _user_id AND status IN ('waiting','matching');
$$;

-- ---------- G3: Skip anti-abuse settings & cooldown ----------
ALTER TABLE public.random_call_settings
  ADD COLUMN IF NOT EXISTS skip_soft_cap          integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS skip_hard_cap          integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS skip_window_seconds    integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS cooldown_seconds_soft  integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS cooldown_seconds_hard  integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS skip_diamond_penalty   integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.apply_random_skip_penalty(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  cnt integer;
  window_start timestamptz;
  cool_until timestamptz;
  penalty integer := 0;
BEGIN
  SELECT skip_soft_cap, skip_hard_cap, skip_window_seconds,
         cooldown_seconds_soft, cooldown_seconds_hard, skip_diamond_penalty
    INTO s FROM public.random_call_settings ORDER BY id LIMIT 1;
  IF s IS NULL THEN RETURN jsonb_build_object('ok', true, 'cooldown_seconds', 0); END IF;

  window_start := now() - make_interval(secs => s.skip_window_seconds);

  INSERT INTO public.random_call_skip_counters (user_id, last_skip_at, window_start, skip_count)
  VALUES (_user_id, now(), now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET skip_count = CASE WHEN public.random_call_skip_counters.window_start < window_start
                          THEN 1 ELSE public.random_call_skip_counters.skip_count + 1 END,
        window_start = CASE WHEN public.random_call_skip_counters.window_start < window_start
                            THEN now() ELSE public.random_call_skip_counters.window_start END,
        last_skip_at = now()
  RETURNING skip_count INTO cnt;

  IF cnt >= s.skip_hard_cap THEN
    cool_until := now() + make_interval(secs => s.cooldown_seconds_hard);
    penalty := s.skip_diamond_penalty;
  ELSIF cnt >= s.skip_soft_cap THEN
    cool_until := now() + make_interval(secs => s.cooldown_seconds_soft);
  ELSE
    RETURN jsonb_build_object('ok', true, 'cooldown_seconds', 0, 'skip_count', cnt);
  END IF;

  INSERT INTO public.account_lockouts (identifier, locked_at, locked_until, failed_attempts, reason)
  VALUES ('random_match:'||_user_id::text, now(), cool_until, cnt, 'random_match_skip_abuse')
  ON CONFLICT (identifier) DO UPDATE
    SET locked_until = EXCLUDED.locked_until,
        failed_attempts = EXCLUDED.failed_attempts,
        reason = EXCLUDED.reason,
        locked_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'cooldown_seconds', EXTRACT(EPOCH FROM (cool_until - now()))::int,
    'skip_count', cnt,
    'diamond_penalty', penalty,
    'cooldown_until', cool_until
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_random_match_cooldown(_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN locked_until IS NULL OR locked_until <= now()
      THEN jsonb_build_object('blocked', false, 'seconds_remaining', 0)
    ELSE jsonb_build_object(
      'blocked', true,
      'seconds_remaining', EXTRACT(EPOCH FROM (locked_until - now()))::int,
      'reason', reason)
  END
  FROM public.account_lockouts
  WHERE identifier = 'random_match:'||_user_id::text
  LIMIT 1;
$$;

-- ---------- G4: Reconnect grace ----------
ALTER TABLE public.random_call_sessions
  ADD COLUMN IF NOT EXISTS disconnect_grace_until timestamptz,
  ADD COLUMN IF NOT EXISTS reconnect_token uuid;

ALTER TABLE public.private_calls
  ADD COLUMN IF NOT EXISTS reconnect_token uuid,
  ADD COLUMN IF NOT EXISTS reconnect_grace_until timestamptz;

CREATE OR REPLACE FUNCTION public.mark_call_reconnecting(
  _kind text, _call_id uuid, _grace_seconds integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE tok uuid := gen_random_uuid(); until_ts timestamptz := now() + make_interval(secs => _grace_seconds);
BEGIN
  IF _kind = 'private' THEN
    UPDATE public.private_calls
      SET reconnect_token = tok, reconnect_grace_until = until_ts, updated_at = now()
    WHERE id = _call_id AND status IN ('active','ringing','accepted');
  ELSIF _kind = 'random' THEN
    UPDATE public.random_call_sessions
      SET reconnect_token = tok, disconnect_grace_until = until_ts,
          is_reconnecting = true, reconnecting_since = now(), updated_at = now()
    WHERE id = _call_id AND status IN ('active','connected');
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;
  RETURN jsonb_build_object('ok', true, 'token', tok, 'grace_until', until_ts);
END;
$$;

CREATE OR REPLACE FUNCTION public.attempt_call_reconnect(
  _kind text, _call_id uuid, _token uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE room text; ok boolean := false;
BEGIN
  IF _kind = 'private' THEN
    SELECT livekit_room INTO room FROM public.private_calls
     WHERE id = _call_id AND reconnect_token = _token
       AND reconnect_grace_until > now() AND status IN ('active','accepted');
    IF FOUND THEN
      UPDATE public.private_calls SET reconnect_token = NULL, reconnect_grace_until = NULL, updated_at = now()
       WHERE id = _call_id;
      ok := true;
    END IF;
  ELSIF _kind = 'random' THEN
    SELECT livekit_room FROM public.private_calls pc
      INNER JOIN public.random_call_sessions r ON r.linked_private_call_id = pc.id
      WHERE r.id = _call_id INTO room;
    IF EXISTS (SELECT 1 FROM public.random_call_sessions
               WHERE id = _call_id AND reconnect_token = _token
                 AND disconnect_grace_until > now()) THEN
      UPDATE public.random_call_sessions
        SET is_reconnecting = false, reconnect_token = NULL,
            disconnect_grace_until = NULL, updated_at = now()
       WHERE id = _call_id;
      ok := true;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', ok, 'livekit_room', room);
END;
$$;

-- ---------- G5: Post-call rating ----------
CREATE TABLE IF NOT EXISTS public.random_call_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES public.random_call_sessions(id) ON DELETE CASCADE,
  rater_id      uuid NOT NULL,
  ratee_id      uuid NOT NULL,
  stars         smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tags          text[] NOT NULL DEFAULT '{}',
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, rater_id)
);

GRANT SELECT, INSERT ON public.random_call_ratings TO authenticated;
GRANT ALL ON public.random_call_ratings TO service_role;

ALTER TABLE public.random_call_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rater inserts own rating" ON public.random_call_ratings;
CREATE POLICY "rater inserts own rating" ON public.random_call_ratings
  FOR INSERT TO authenticated
  WITH CHECK (rater_id = auth.uid());

DROP POLICY IF EXISTS "participants can read rating" ON public.random_call_ratings;
CREATE POLICY "participants can read rating" ON public.random_call_ratings
  FOR SELECT TO authenticated
  USING (rater_id = auth.uid() OR ratee_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_rcr_ratee ON public.random_call_ratings (ratee_id);
CREATE INDEX IF NOT EXISTS idx_rcr_session ON public.random_call_ratings (session_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS random_match_avg_rating numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS random_match_rating_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.update_ratee_rating_aggregate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE avg_v numeric; cnt_v integer;
BEGIN
  SELECT ROUND(AVG(stars)::numeric, 2), COUNT(*)
    INTO avg_v, cnt_v
    FROM public.random_call_ratings WHERE ratee_id = NEW.ratee_id;
  UPDATE public.profiles
    SET random_match_avg_rating = COALESCE(avg_v, 0),
        random_match_rating_count = cnt_v
    WHERE id = NEW.ratee_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rcr_update_avg ON public.random_call_ratings;
CREATE TRIGGER trg_rcr_update_avg
  AFTER INSERT ON public.random_call_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_ratee_rating_aggregate();

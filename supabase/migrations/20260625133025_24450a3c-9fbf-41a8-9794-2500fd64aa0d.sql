
-- =========================================================================
-- RANDOM MATCH — AUDIT FIX PASS (logic-only, no UI changes)
-- =========================================================================

-- ---------- FIX 1: convert_random_to_private ----------
-- (a) Read host rate from host_match_preferences (single source of truth) instead of profiles.call_rate_per_minute.
-- (b) No-op: private_calls has no livekit_room column; the LiveKit room stays
--     on random_call_sessions and is the source for reconnect (FIX 3).
CREATE OR REPLACE FUNCTION public.convert_random_to_private(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s        RECORD;
  v_settings RECORD;
  v_caller   RECORD;
  v_rate     BIGINT;
  v_need     BIGINT;
  v_pc_id    UUID;
BEGIN
  SELECT * INTO v_settings FROM public.random_call_settings WHERE id = 1;
  IF NOT FOUND OR v_settings.auto_convert_to_private IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auto_convert_disabled');
  END IF;

  SELECT * INTO v_s FROM public.random_call_sessions
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'session_not_found'); END IF;
  IF v_s.settled OR v_s.linked_private_call_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_handled',
                              'linked_private_call_id', v_s.linked_private_call_id);
  END IF;
  IF v_s.status NOT IN ('active','accepted','connected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'status', v_s.status);
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_s.caller_id AND auth.uid() <> v_s.host_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Single source of truth: host_match_preferences.coin_rate_per_min
  SELECT COALESCE(coin_rate_per_min, 0)::BIGINT
    INTO v_rate
    FROM public.host_match_preferences
   WHERE host_id = v_s.host_id;

  -- Fallback chain: session-locked rate → profiles → admin default
  IF v_rate IS NULL OR v_rate <= 0 THEN
    v_rate := COALESCE(v_s.coin_rate_per_min, 0)::BIGINT;
  END IF;
  IF v_rate <= 0 THEN
    SELECT COALESCE(call_rate_per_minute, 0)::BIGINT INTO v_rate
      FROM public.profiles WHERE id = v_s.host_id;
  END IF;
  IF v_rate <= 0 THEN
    v_rate := COALESCE(v_settings.default_host_rate_coins_per_min, 0)::BIGINT;
  END IF;

  SELECT id, COALESCE(coins, 0)::BIGINT AS coins
    INTO v_caller FROM public.profiles WHERE id = v_s.caller_id FOR UPDATE;

  IF v_rate <= 0 THEN
    UPDATE public.random_call_sessions
       SET status='ended_no_rate', ended_at=COALESCE(ended_at, now()),
           settled=true, updated_at=now()
     WHERE id = p_session_id;
    RETURN jsonb_build_object('ok', false, 'error', 'host_rate_not_configured');
  END IF;

  v_need := CEIL(v_rate::NUMERIC
                 * COALESCE(v_settings.convert_min_balance_seconds, 60)::NUMERIC
                 / 60.0)::BIGINT;

  IF v_caller.coins < v_need THEN
    UPDATE public.random_call_sessions
       SET status='ended_no_balance', ended_by='system_no_balance',
           ended_at=COALESCE(ended_at, now()), settled=true, updated_at=now()
     WHERE id = p_session_id;
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance',
                              'required_coins', v_need,
                              'caller_coins', v_caller.coins,
                              'rate_per_min', v_rate);
  END IF;

  INSERT INTO public.private_calls (
    caller_id, host_id, status, started_at, connected_at,
    coins_per_minute, viewer_rate_per_min, host_rate_per_min,
    platform_cut_percent
  ) VALUES (
    v_s.caller_id, v_s.host_id, 'active', now(), now(),
    v_rate::INT, v_rate, v_rate,
    GREATEST(0, LEAST(100, ROUND((1.0 - COALESCE(v_settings.host_split_pct, 0.60)) * 100)))::INT
  ) RETURNING id INTO v_pc_id;

  UPDATE public.random_call_sessions
     SET status='converted_to_private',
         linked_private_call_id = v_pc_id,
         converted_at = now(),
         ended_at = COALESCE(ended_at, now()),
         settled = true,
         duration_seconds = COALESCE(v_settings.random_window_seconds, 60),
         billable_seconds = 0,
         coins_charged = 0,
         beans_awarded = 0,
         updated_at = now()
   WHERE id = p_session_id;

  UPDATE public.host_match_preferences
     SET total_calls = total_calls + 1, updated_at = now()
   WHERE host_id = v_s.host_id;

  RETURN jsonb_build_object('ok', true,
                            'private_call_id', v_pc_id,
                            'rate_per_min', v_rate,
                            'caller_coins', v_caller.coins);
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_random_to_private(UUID) TO authenticated, service_role;

-- ---------- FIX 2: settle_random_call uses SERVER-AUTHORITATIVE duration ----------
-- Client value is only honored when it does not exceed server-computed duration,
-- preventing tampered "duration=0" free calls or inflated payouts.
CREATE OR REPLACE FUNCTION public.settle_random_call(
  p_session_id UUID, p_duration_seconds INTEGER, p_ended_by TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s        RECORD;
  v_settings RECORD;
  v_window   INT;
  v_status   TEXT;
  v_skip_result JSONB := NULL;
  v_server_dur INT;
  v_dur      INT;
BEGIN
  SELECT * INTO v_s FROM public.random_call_sessions
    WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;
  IF v_s.settled THEN
    RETURN jsonb_build_object('ok', true, 'already_settled', true,
                              'linked_private_call_id', v_s.linked_private_call_id);
  END IF;

  SELECT * INTO v_settings FROM public.random_call_settings WHERE id = 1;
  v_window := COALESCE(v_settings.random_window_seconds, 60);

  -- Server-authoritative duration: floor at 0, cap at server-computed elapsed.
  v_server_dur := GREATEST(0,
    EXTRACT(EPOCH FROM (now() - COALESCE(v_s.accepted_at, v_s.started_at, now())))::INT);
  v_dur := LEAST(GREATEST(COALESCE(p_duration_seconds, 0), 0), v_server_dur);

  v_status := CASE
    WHEN p_ended_by = 'caller_skip' THEN 'skipped'
    WHEN p_ended_by = 'host'        THEN 'ended_by_host'
    WHEN p_ended_by = 'caller'      THEN 'ended_by_caller'
    WHEN p_ended_by = 'admin'       THEN 'ended_by_admin'
    ELSE 'completed'
  END;

  IF p_ended_by = 'host' AND v_dur < v_window THEN
    UPDATE public.host_match_preferences
       SET flash_disconnects_count = flash_disconnects_count + 1,
           updated_at = now(),
           flash_disconnect_cooldown_until = CASE
             WHEN flash_disconnects_count + 1 >= COALESCE(v_settings.flash_disconnect_threshold, 3)
             THEN now() + (COALESCE(v_settings.flash_disconnect_cooldown_minutes, 30) || ' minutes')::INTERVAL
             ELSE flash_disconnect_cooldown_until
           END
     WHERE host_id = v_s.host_id;
  END IF;

  IF p_ended_by = 'caller_skip'
     AND v_dur < COALESCE(v_settings.free_preview_seconds, v_window) THEN
    v_skip_result := public.register_random_skip(v_s.caller_id);
  END IF;

  UPDATE public.random_call_sessions
     SET status = v_status,
         duration_seconds = v_dur,
         billable_seconds = 0,
         coins_charged = 0,
         beans_awarded = 0,
         ended_by = p_ended_by,
         ended_at = COALESCE(ended_at, now()),
         settled = true,
         updated_at = now()
   WHERE id = p_session_id;

  UPDATE public.host_match_preferences
     SET total_calls = total_calls + 1, updated_at = now()
   WHERE host_id = v_s.host_id;

  RETURN jsonb_build_object('ok', true,
                            'status', v_status,
                            'duration_seconds', v_dur,
                            'server_duration_seconds', v_server_dur,
                            'free_window_seconds', v_window,
                            'coins_charged', 0,
                            'beans_awarded', 0,
                            'skip_registered', v_skip_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_random_call(UUID, INTEGER, TEXT) TO authenticated, service_role;

-- ---------- FIX 3: attempt_call_reconnect — read room from correct table ----------
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
    -- private_calls has no livekit_room column; use stream_id
    SELECT stream_id::text INTO room FROM public.private_calls
     WHERE id = _call_id AND reconnect_token = _token
       AND reconnect_grace_until > now() AND status IN ('active','accepted','ringing');
    IF FOUND THEN
      UPDATE public.private_calls
         SET reconnect_token = NULL, reconnect_grace_until = NULL, updated_at = now()
       WHERE id = _call_id;
      ok := true;
    END IF;
  ELSIF _kind = 'random' THEN
    SELECT livekit_room INTO room FROM public.random_call_sessions
     WHERE id = _call_id AND reconnect_token = _token
       AND disconnect_grace_until > now()
       AND status IN ('active','connected','accepted');
    IF FOUND THEN
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

-- ---------- FIX 4: Realtime publication + replica identity ----------
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.host_match_availability;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.random_call_queue REPLICA IDENTITY FULL;
ALTER TABLE public.random_call_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.host_match_availability REPLICA IDENTITY FULL;

-- ---------- FIX 5: Safe public sample for FloatingRandomMatchPill ----------
-- The pill needs 2-3 host avatars but random_call_queue RLS only lets each
-- user read their own row. Expose a SECURITY DEFINER RPC that returns
-- avatar URLs only (no user identifiers).
CREATE OR REPLACE FUNCTION public.get_random_pool_sample(_limit INT DEFAULT 6)
RETURNS TABLE (avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.avatar_url
    FROM public.random_call_queue q
    JOIN public.profiles p ON p.id = q.user_id
   WHERE q.role = 'host' AND q.status = 'waiting'
     AND p.avatar_url IS NOT NULL
   ORDER BY q.entered_at DESC
   LIMIT GREATEST(1, LEAST(20, _limit));
$$;

GRANT EXECUTE ON FUNCTION public.get_random_pool_sample(INT) TO anon, authenticated, service_role;

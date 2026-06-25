
ALTER TABLE public.random_call_settings
  ADD COLUMN IF NOT EXISTS random_window_seconds INT NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS auto_convert_to_private BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS convert_min_balance_seconds INT NOT NULL DEFAULT 60;

ALTER TABLE public.random_call_sessions
  ADD COLUMN IF NOT EXISTS linked_private_call_id UUID NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_random_call_sessions_linked_private
  ON public.random_call_sessions(linked_private_call_id);

CREATE OR REPLACE FUNCTION public.convert_random_to_private(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s        RECORD;
  v_settings RECORD;
  v_host     RECORD;
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

  SELECT id, COALESCE(call_rate_per_minute, 0)::BIGINT AS rate
    INTO v_host FROM public.profiles WHERE id = v_s.host_id;
  SELECT id, COALESCE(coins, 0)::BIGINT AS coins
    INTO v_caller FROM public.profiles WHERE id = v_s.caller_id FOR UPDATE;

  v_rate := GREATEST(v_host.rate, COALESCE(v_settings.default_host_rate_coins_per_min, 0)::BIGINT);

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
    caller_id, host_id, status, started_at, accepted_at,
    coin_rate_per_min, viewer_rate_per_min, host_rate_per_min,
    host_split_pct, free_trial_seconds, min_billable_seconds
  ) VALUES (
    v_s.caller_id, v_s.host_id, 'active', now(), now(),
    v_rate::INT, v_rate, v_rate,
    COALESCE(v_settings.host_split_pct, 0.60),
    0, 0
  ) RETURNING id INTO v_pc_id;

  UPDATE public.random_call_sessions
     SET status='converted_to_private',
         linked_private_call_id = v_pc_id,
         converted_at = now(),
         ended_at = COALESCE(ended_at, now()),
         end_reason = 'converted_to_private',
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

  v_status := CASE
    WHEN p_ended_by = 'caller_skip' THEN 'skipped'
    WHEN p_ended_by = 'host'        THEN 'ended_by_host'
    WHEN p_ended_by = 'caller'      THEN 'ended_by_caller'
    ELSE 'completed'
  END;

  IF p_ended_by = 'host' AND p_duration_seconds < v_window THEN
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
     AND p_duration_seconds < COALESCE(v_settings.free_preview_seconds, v_window) THEN
    v_skip_result := public.register_random_skip(v_s.caller_id);
  END IF;

  UPDATE public.random_call_sessions
     SET status = v_status,
         duration_seconds = p_duration_seconds,
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
                            'duration_seconds', p_duration_seconds,
                            'free_window_seconds', v_window,
                            'coins_charged', 0,
                            'beans_awarded', 0,
                            'skip_registered', v_skip_result);
END;
$$;

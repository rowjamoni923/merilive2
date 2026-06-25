
-- 1) Lock random-call price to 500 diamonds/min, 50% host share
UPDATE public.random_call_settings
   SET default_host_rate_coins_per_min = 500,
       host_min_rate_coins_per_min     = 500,
       host_max_rate_coins_per_min     = 500,
       host_split_pct                  = 0.50,
       min_billable_seconds            = COALESCE(min_billable_seconds, 40),
       random_window_seconds           = 60,
       convert_min_balance_seconds     = COALESCE(convert_min_balance_seconds, 60),
       updated_at                      = now()
 WHERE id = 1;

-- 2) Rewrite settle_random_call to actually charge 500/min prorated within the first minute
CREATE OR REPLACE FUNCTION public.settle_random_call(
  p_session_id uuid, p_duration_seconds integer, p_ended_by text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_s            RECORD;
  v_settings     RECORD;
  v_window       INT;
  v_min_bill     INT;
  v_rate         INT;       -- caller per-min (500)
  v_split        NUMERIC;   -- host share (0.50)
  v_status       TEXT;
  v_skip_result  JSONB := NULL;
  v_server_dur   INT;
  v_dur          INT;
  v_billable     INT;
  v_charge       BIGINT := 0;
  v_host_award   BIGINT := 0;
  v_caller_coins BIGINT;
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
  v_window   := COALESCE(v_settings.random_window_seconds, 60);
  v_min_bill := COALESCE(v_settings.min_billable_seconds, 40);
  v_rate     := COALESCE(v_settings.default_host_rate_coins_per_min, 500);
  v_split    := COALESCE(v_settings.host_split_pct, 0.50);

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

  -- Cap billable seconds to first-minute window
  v_billable := LEAST(v_dur, v_window);

  -- Charge only if ≥ min_billable_seconds AND not a host flash-disconnect
  IF v_billable >= v_min_bill AND p_ended_by NOT IN ('host','admin','caller_skip') THEN
    v_charge     := CEIL(v_rate::NUMERIC * v_billable::NUMERIC / 60.0)::BIGINT;
    v_host_award := CEIL(v_charge::NUMERIC * v_split)::BIGINT;

    SELECT COALESCE(coins,0)::BIGINT INTO v_caller_coins
      FROM public.profiles WHERE id = v_s.caller_id FOR UPDATE;

    IF v_caller_coins < v_charge THEN
      v_charge := v_caller_coins;
      v_host_award := CEIL(v_charge::NUMERIC * v_split)::BIGINT;
    END IF;

    IF v_charge > 0 THEN
      UPDATE public.profiles
         SET coins = GREATEST(0, COALESCE(coins,0) - v_charge),
             updated_at = now()
       WHERE id = v_s.caller_id;

      UPDATE public.profiles
         SET beans = COALESCE(beans,0) + v_host_award,
             updated_at = now()
       WHERE id = v_s.host_id;
    END IF;
  END IF;

  -- Flash-disconnect penalty for host (unchanged behaviour)
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
     SET status            = v_status,
         duration_seconds  = v_dur,
         billable_seconds  = v_billable,
         coins_charged     = v_charge,
         beans_awarded     = v_host_award,
         ended_by          = p_ended_by,
         ended_at          = COALESCE(ended_at, now()),
         settled           = true,
         updated_at        = now()
   WHERE id = p_session_id;

  UPDATE public.host_match_preferences
     SET total_calls = total_calls + 1, updated_at = now()
   WHERE host_id = v_s.host_id;

  RETURN jsonb_build_object('ok', true,
    'status', v_status,
    'duration_seconds', v_dur,
    'server_duration_seconds', v_server_dur,
    'free_window_seconds', v_window,
    'coins_charged', v_charge,
    'beans_awarded', v_host_award,
    'skip_registered', v_skip_result);
END;
$function$;

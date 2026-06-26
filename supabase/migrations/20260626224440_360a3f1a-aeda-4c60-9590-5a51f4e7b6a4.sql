CREATE OR REPLACE FUNCTION public.convert_random_to_private(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(coin_rate_per_min, 0)::BIGINT
    INTO v_rate
    FROM public.host_match_preferences
   WHERE host_id = v_s.host_id;

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

  SELECT id,
         COALESCE(coins, 0)::BIGINT AS coins,
         COALESCE(diamonds, 0)::BIGINT AS diamonds,
         GREATEST(COALESCE(coins, 0), COALESCE(diamonds, 0))::BIGINT AS balance
    INTO v_caller
    FROM public.profiles
   WHERE id = v_s.caller_id
   FOR UPDATE;

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

  IF COALESCE(v_caller.balance, 0) < v_need THEN
    UPDATE public.random_call_sessions
       SET status='ended_no_balance', ended_by='system_no_balance',
           ended_at=COALESCE(ended_at, now()), settled=true, updated_at=now()
     WHERE id = p_session_id;
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance',
                              'required_coins', v_need,
                              'caller_coins', COALESCE(v_caller.balance, 0),
                              'caller_balance', COALESCE(v_caller.balance, 0),
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
                            'caller_coins', COALESCE(v_caller.balance, 0),
                            'caller_balance', COALESCE(v_caller.balance, 0));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.convert_random_to_private(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_random_call(
  p_session_id uuid, p_duration_seconds integer, p_ended_by text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_s               RECORD;
  v_settings        RECORD;
  v_window          INT;
  v_min_bill        INT;
  v_rate            INT;
  v_split           NUMERIC;
  v_status          TEXT;
  v_skip_result     JSONB := NULL;
  v_server_dur      INT;
  v_dur             INT;
  v_billable        INT;
  v_charge          BIGINT := 0;
  v_host_award      BIGINT := 0;
  v_caller_coins    BIGINT := 0;
  v_caller_diamonds BIGINT := 0;
  v_caller_balance  BIGINT := 0;
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

  v_billable := LEAST(v_dur, v_window);

  IF v_billable >= v_min_bill AND p_ended_by NOT IN ('host','admin','caller_skip') THEN
    v_charge     := CEIL(v_rate::NUMERIC * v_billable::NUMERIC / 60.0)::BIGINT;
    v_host_award := CEIL(v_charge::NUMERIC * v_split)::BIGINT;

    SELECT COALESCE(coins,0)::BIGINT,
           COALESCE(diamonds,0)::BIGINT,
           GREATEST(COALESCE(coins,0), COALESCE(diamonds,0))::BIGINT
      INTO v_caller_coins, v_caller_diamonds, v_caller_balance
      FROM public.profiles
     WHERE id = v_s.caller_id
     FOR UPDATE;

    IF v_caller_balance < v_charge THEN
      v_charge := v_caller_balance;
      v_host_award := CEIL(v_charge::NUMERIC * v_split)::BIGINT;
    END IF;

    IF v_charge > 0 THEN
      UPDATE public.profiles
         SET coins = CASE
               WHEN COALESCE(coins,0) >= COALESCE(diamonds,0)
               THEN GREATEST(0, COALESCE(coins,0) - v_charge)
               ELSE COALESCE(coins,0)
             END,
             diamonds = CASE
               WHEN COALESCE(diamonds,0) > COALESCE(coins,0)
               THEN GREATEST(0, COALESCE(diamonds,0) - v_charge)
               ELSE COALESCE(diamonds,0)
             END,
             updated_at = now()
       WHERE id = v_s.caller_id;

      UPDATE public.profiles
         SET beans = COALESCE(beans,0) + v_host_award,
             updated_at = now()
       WHERE id = v_s.host_id;
    END IF;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.settle_random_call(uuid, integer, text) TO authenticated, service_role;
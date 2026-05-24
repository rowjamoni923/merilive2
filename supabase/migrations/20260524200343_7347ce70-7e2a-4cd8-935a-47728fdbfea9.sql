
DROP FUNCTION IF EXISTS public.cleanup_stale_in_call_flags();

CREATE OR REPLACE FUNCTION public.settle_private_call(p_call_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _call record; _settings_text text; _settings jsonb;
  _host_percent numeric; _grace_seconds integer;
  _duration integer; _minutes integer;
  _expected_charge bigint; _final_charge bigint;
  _already_charged bigint; _delta_charge bigint;
  _charged_delta bigint := 0;
  _expected_host_beans bigint; _already_credited bigint; _delta_host_beans bigint;
  _caller_balance bigint; _is_internal boolean;
BEGIN
  _is_internal := COALESCE(current_setting('app.bypass_call_auth', true) = 'true', false)
                  OR COALESCE(current_setting('request.jwt.claim.role', true) = 'service_role', false);

  SELECT * INTO _call FROM public.private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'call_not_found'); END IF;

  IF NOT _is_internal THEN
    IF auth.uid() IS NULL OR auth.uid() NOT IN (_call.caller_id, _call.host_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'unauthorized_call_settlement');
    END IF;
  END IF;

  IF _call.settled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_settled', true);
  END IF;

  SELECT setting_value INTO _settings_text FROM public.app_settings WHERE setting_key = 'call_rates';
  IF _settings_text IS NULL OR btrim(_settings_text) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call pricing is not configured.');
  END IF;
  BEGIN
    _settings := _settings_text::jsonb;
    _host_percent := (_settings->>'host_commission_percent')::numeric;
    _grace_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call pricing JSON invalid.');
  END;
  IF _host_percent IS NULL OR _host_percent < 0 OR _host_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'host_commission_percent missing.');
  END IF;
  IF _grace_seconds IS NULL OR _grace_seconds < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'first_minute_grace_seconds missing.');
  END IF;

  _duration := GREATEST(0, COALESCE(_call.duration_seconds, 0));
  _already_charged := COALESCE(_call.total_coins_deducted, _call.coins_spent, 0)::bigint;
  _already_credited := COALESCE(_call.host_earned, _call.host_earnings_amount, 0)::bigint;

  IF _duration < _grace_seconds THEN
    _expected_charge := COALESCE(_call.coins_per_minute, 0)::bigint;
  ELSE
    _minutes := CEIL(_duration::numeric / 60.0)::integer;
    _expected_charge := (_minutes::bigint * COALESCE(_call.coins_per_minute, 0)::bigint);
  END IF;

  _delta_charge := _expected_charge - _already_charged;
  _final_charge := _expected_charge;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _delta_charge > 0 THEN
    SELECT COALESCE(coins, 0)::bigint INTO _caller_balance
      FROM public.profiles WHERE id = _call.caller_id FOR UPDATE;
    _charged_delta := LEAST(_delta_charge, COALESCE(_caller_balance, 0));
    _final_charge := _already_charged + _charged_delta;
    IF _charged_delta > 0 THEN
      UPDATE public.profiles
        SET coins = COALESCE(coins, 0) - _charged_delta,
            total_consumption = COALESCE(total_consumption, 0) + _charged_delta,
            updated_at = now()
        WHERE id = _call.caller_id;
    END IF;
  ELSIF _delta_charge < 0 THEN
    UPDATE public.profiles
      SET coins = COALESCE(coins, 0) + ABS(_delta_charge),
          total_consumption = GREATEST(0, COALESCE(total_consumption, 0) - ABS(_delta_charge)),
          updated_at = now()
      WHERE id = _call.caller_id;
    _final_charge := _expected_charge;
  END IF;

  IF _duration < _grace_seconds THEN
    _expected_host_beans := 0;
  ELSE
    _expected_host_beans := FLOOR(_final_charge::numeric * _host_percent / 100.0)::bigint;
  END IF;

  _delta_host_beans := _expected_host_beans - _already_credited;

  IF _delta_host_beans > 0 THEN
    UPDATE public.profiles
      SET beans = COALESCE(beans, 0) + _delta_host_beans,
          total_earnings = COALESCE(total_earnings, 0) + _delta_host_beans,
          weekly_earnings = COALESCE(weekly_earnings, 0) + _delta_host_beans,
          pending_earnings = COALESCE(pending_earnings, 0) + _delta_host_beans,
          updated_at = now()
      WHERE id = _call.host_id;
  ELSIF _delta_host_beans < 0 THEN
    UPDATE public.profiles
      SET beans = GREATEST(0, COALESCE(beans, 0) - ABS(_delta_host_beans)),
          total_earnings = GREATEST(0, COALESCE(total_earnings, 0) - ABS(_delta_host_beans)),
          weekly_earnings = GREATEST(0, COALESCE(weekly_earnings, 0) - ABS(_delta_host_beans)),
          pending_earnings = GREATEST(0, COALESCE(pending_earnings, 0) - ABS(_delta_host_beans)),
          updated_at = now()
      WHERE id = _call.host_id;
  END IF;

  UPDATE public.private_calls
    SET coins_spent = _final_charge,
        total_coins_deducted = _final_charge,
        host_earned = _expected_host_beans,
        host_earnings_amount = _expected_host_beans,
        settled_at = now(),
        updated_at = now()
    WHERE id = p_call_id;

  RETURN jsonb_build_object(
    'success', true,
    'duration_seconds', _duration,
    'grace_seconds', _grace_seconds,
    'minutes_charged', CASE WHEN _duration < _grace_seconds THEN 1 ELSE CEIL(_duration::numeric / 60.0)::integer END,
    'coins_charged_total', _final_charge,
    'host_beans_total', _expected_host_beans,
    'host_percent', _host_percent,
    'short_paid_delta', GREATEST(_delta_charge - _charged_delta, 0),
    'internal', _is_internal
  );
END;
$function$;

CREATE FUNCTION public.cleanup_stale_in_call_flags()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _orphan record;
  _ended integer := 0;
  _missed integer := 0;
  _flag_clears integer := 0;
  _last_activity timestamptz;
  _duration_sec integer;
BEGIN
  PERFORM set_config('app.bypass_call_auth', 'true', true);

  FOR _orphan IN
    SELECT id, caller_id, host_id, connected_at, last_billing_at, started_at
      FROM public.private_calls
     WHERE status = 'connected'
       AND ended_at IS NULL
       AND COALESCE(last_billing_at, connected_at, started_at) < now() - interval '90 seconds'
     FOR UPDATE
  LOOP
    _last_activity := COALESCE(_orphan.last_billing_at, _orphan.connected_at, _orphan.started_at);
    _duration_sec  := GREATEST(0, EXTRACT(EPOCH FROM (_last_activity - COALESCE(_orphan.connected_at, _orphan.started_at)))::integer);

    UPDATE public.private_calls
       SET status = 'ended',
           ended_at = now(),
           end_reason = COALESCE(end_reason, 'stale_orphan'),
           duration_seconds = GREATEST(COALESCE(duration_seconds, 0), _duration_sec),
           updated_at = now()
     WHERE id = _orphan.id;

    BEGIN
      PERFORM public.settle_private_call(_orphan.id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    _ended := _ended + 1;
  END LOOP;

  UPDATE public.private_calls
     SET status = 'missed', ended_at = now(),
         end_reason = COALESCE(end_reason, 'stale_cleanup'),
         updated_at = now()
   WHERE status IN ('ringing', 'pending')
     AND started_at < now() - interval '60 seconds'
     AND ended_at IS NULL;
  GET DIAGNOSTICS _missed = ROW_COUNT;

  WITH cleared AS (
    UPDATE public.profiles p
       SET is_in_call = false, current_call_id = NULL, updated_at = now()
      FROM public.private_calls pc
     WHERE p.current_call_id = pc.id
       AND p.is_in_call = true
       AND pc.status IN ('ended','missed','declined','cancelled')
    RETURNING 1
  )
  SELECT count(*) INTO _flag_clears FROM cleared;

  UPDATE public.profiles
     SET is_in_call = false, current_call_id = NULL, updated_at = now()
   WHERE is_in_call = true
     AND current_call_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.private_calls pc WHERE pc.id = current_call_id);

  UPDATE public.profiles
     SET is_in_call = false, updated_at = now()
   WHERE is_in_call = true AND current_call_id IS NULL;

  PERFORM set_config('app.bypass_call_auth', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'orphans_settled', _ended,
    'missed_cleared', _missed,
    'flag_clears', _flag_clears,
    'ran_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_stale_in_call_flags() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cleanup_stuck_calls() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_in_call_flags() TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.cleanup_stuck_calls() TO service_role, postgres;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup_stale_private_calls_every_minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup_stale_private_calls_every_minute',
  '* * * * *',
  $cron$ SELECT public.cleanup_stale_in_call_flags(); $cron$
);

CREATE INDEX IF NOT EXISTS idx_private_calls_connected_billing
  ON public.private_calls (status, last_billing_at)
  WHERE status = 'connected';

-- Server billing P2:
--   1. refund_call_on_failed_connect(p_call_id) — safety-net refund used by
--      `private-call/end` (and admin tools) whenever a call ends without
--      reaching a clean billed state. Reads billing_ledger as the source of
--      truth (already uniquely indexed on (call_id, minute_number) so it is
--      naturally idempotent) and reverses both the caller deduction and the
--      host beans/earnings credit for every billed minute. Marks the row with
--      end_reason='connect_failed' (or preserves the existing reason) and
--      records a `call_refunded` event for the post-mortem.
--   2. cleanup_stale_in_call_flags() — now distinguishes orphan reason:
--        - `network`  when the call was paused mid-reconnect (`is_reconnecting=true`)
--        - `stuck`    when last activity stalled past 90s with no reconnect flag
--      so analytics and the CallEndedModal show the right message and the
--      caller is not unfairly blamed for hangup.

CREATE OR REPLACE FUNCTION public.refund_call_on_failed_connect(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call            record;
  _ledger          record;
  _viewer_refund   bigint := 0;
  _host_reverse    bigint := 0;
  _minutes         integer := 0;
BEGIN
  SELECT * INTO _call
    FROM public.private_calls
   WHERE id = p_call_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'not_found');
  END IF;

  -- Only refund if the call never reached a stable billed state.
  -- Either it ended before connecting (connected_at IS NULL) or its end
  -- reason is in the unhealthy set. Already-refunded calls (marked by a
  -- `call_refunded` event) are skipped to keep the operation idempotent.
  IF EXISTS (
       SELECT 1 FROM public.call_events
        WHERE call_id = p_call_id AND event_type = 'call_refunded'
     ) THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'already_refunded');
  END IF;

  IF _call.connected_at IS NOT NULL
     AND COALESCE(_call.end_reason, '') NOT IN ('connect_failed','network','stuck') THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'healthy_end');
  END IF;

  -- Sum every billed minute for this call. billing_ledger has a unique
  -- index on (call_id, minute_number) so the totals are exact.
  FOR _ledger IN
    SELECT viewer_deducted, host_credited
      FROM public.billing_ledger
     WHERE call_id = p_call_id
     FOR UPDATE
  LOOP
    _viewer_refund := _viewer_refund + COALESCE(_ledger.viewer_deducted, 0);
    _host_reverse  := _host_reverse  + COALESCE(_ledger.host_credited,  0);
    _minutes       := _minutes + 1;
  END LOOP;

  IF _viewer_refund > 0 THEN
    UPDATE public.profiles
       SET coins             = COALESCE(coins, 0) + _viewer_refund,
           total_consumption = GREATEST(0, COALESCE(total_consumption, 0) - _viewer_refund),
           updated_at        = now()
     WHERE id = _call.caller_id;
  END IF;

  IF _host_reverse > 0 THEN
    UPDATE public.profiles
       SET beans            = GREATEST(0, COALESCE(beans, 0)            - _host_reverse),
           total_earnings   = GREATEST(0, COALESCE(total_earnings, 0)   - _host_reverse),
           weekly_earnings  = GREATEST(0, COALESCE(weekly_earnings, 0)  - _host_reverse),
           pending_earnings = GREATEST(0, COALESCE(pending_earnings, 0) - _host_reverse),
           updated_at       = now()
     WHERE id = _call.host_id;
  END IF;

  UPDATE public.private_calls
     SET total_coins_deducted = 0,
         host_earned          = 0,
         end_reason           = COALESCE(NULLIF(end_reason,''), 'connect_failed'),
         updated_at           = now()
   WHERE id = p_call_id;

  BEGIN
    INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
    VALUES (
      p_call_id,
      'call_refunded',
      jsonb_build_object(
        'viewer_refunded', _viewer_refund,
        'host_reversed',   _host_reverse,
        'minutes_reversed', _minutes,
        'source',          'refund_on_failed_connect'
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'refunded',         true,
    'viewer_refunded',  _viewer_refund,
    'host_reversed',    _host_reverse,
    'minutes_reversed', _minutes
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refund_call_on_failed_connect(uuid) TO service_role;

-- ── Patch sweeper to record a precise end_reason ──────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_stale_in_call_flags()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _orphan record;
  _ended integer := 0;
  _missed integer := 0;
  _flag_clears integer := 0;
  _last_activity timestamptz;
  _duration_sec integer;
  _reason text;
BEGIN
  PERFORM set_config('app.bypass_call_auth', 'true', true);

  FOR _orphan IN
    SELECT id, caller_id, host_id, connected_at, last_billing_at, started_at,
           is_reconnecting, reconnecting_since, last_billed_minute
      FROM public.private_calls
     WHERE status = 'connected'
       AND ended_at IS NULL
       AND COALESCE(last_billing_at, connected_at, started_at) < now() - interval '90 seconds'
     FOR UPDATE
  LOOP
    _last_activity := COALESCE(_orphan.last_billing_at, _orphan.connected_at, _orphan.started_at);
    _duration_sec  := GREATEST(0, EXTRACT(EPOCH FROM (_last_activity - COALESCE(_orphan.connected_at, _orphan.started_at)))::integer);

    -- Network drop wins over generic 'stuck' so the post-call modal /
    -- end-reason analytics correctly attribute the failure.
    IF COALESCE(_orphan.is_reconnecting, false) = true THEN
      _reason := 'network';
    ELSIF COALESCE(_orphan.last_billed_minute, 0) = 0 THEN
      _reason := 'connect_failed';
    ELSE
      _reason := 'stuck';
    END IF;

    UPDATE public.private_calls
       SET status = 'ended',
           ended_at = now(),
           end_reason = COALESCE(NULLIF(end_reason, ''), _reason),
           duration_seconds = GREATEST(COALESCE(duration_seconds, 0), _duration_sec),
           updated_at = now()
     WHERE id = _orphan.id;

    -- Settle host pending earnings for legitimately billed minutes.
    BEGIN
      PERFORM public.settle_private_call(_orphan.id);
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Refund safety net for calls that never billed a real minute.
    IF _reason = 'connect_failed' THEN
      BEGIN
        PERFORM public.refund_call_on_failed_connect(_orphan.id);
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    _ended := _ended + 1;
  END LOOP;

  UPDATE public.private_calls
     SET status = 'missed', ended_at = now(),
         end_reason = COALESCE(NULLIF(end_reason, ''), 'missed'),
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

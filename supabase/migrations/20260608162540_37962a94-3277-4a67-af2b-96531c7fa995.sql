
-- 1. Lock down call_events: drop loose participant INSERT policy.
-- All inserts must come through SECURITY DEFINER functions (bill_call_minute, accept_private_call, end_private_call, etc).
DROP POLICY IF EXISTS "System can insert call events" ON public.call_events;

-- 2. Add canonical end_reason enforcement via trigger (not CHECK, to keep flexibility).
CREATE OR REPLACE FUNCTION public.private_calls_validate_end_reason()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.end_reason IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.end_reason NOT IN (
    'normal',
    'caller_ended',
    'host_ended',
    'timeout',
    'low_balance',
    'insufficient_balance',
    'network',
    'connect_failed',
    'declined',
    'missed',
    'busy',
    'cancelled',
    'error',
    'admin_ended',
    'kicked',
    'host_offline'
  ) THEN
    RAISE EXCEPTION 'private_calls: invalid end_reason "%". Allowed: normal, caller_ended, host_ended, timeout, low_balance, insufficient_balance, network, connect_failed, declined, missed, busy, cancelled, error, admin_ended, kicked, host_offline', NEW.end_reason
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS private_calls_validate_end_reason_trg ON public.private_calls;
CREATE TRIGGER private_calls_validate_end_reason_trg
  BEFORE INSERT OR UPDATE OF end_reason ON public.private_calls
  FOR EACH ROW EXECUTE FUNCTION public.private_calls_validate_end_reason();

-- 3. Add reconnect tracking fields.
ALTER TABLE public.private_calls
  ADD COLUMN IF NOT EXISTS is_reconnecting boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconnecting_since timestamp with time zone;

-- 4. Extend guard trigger to block client writes to the new fields.
CREATE OR REPLACE FUNCTION public.private_calls_guard_server_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _current_role text := current_user;
BEGIN
  IF _current_role IN ('service_role', 'supabase_admin', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF NEW.caller_id IS DISTINCT FROM OLD.caller_id
     OR NEW.host_id IS DISTINCT FROM OLD.host_id THEN
    RAISE EXCEPTION 'private_calls: caller_id/host_id are immutable'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status                  IS DISTINCT FROM OLD.status
     OR NEW.end_reason           IS DISTINCT FROM COALESCE(OLD.end_reason, NEW.end_reason)
     OR NEW.final_status         IS DISTINCT FROM COALESCE(OLD.final_status, NEW.final_status)
     OR NEW.coins_spent          IS DISTINCT FROM COALESCE(OLD.coins_spent, NEW.coins_spent)
     OR NEW.total_coins_deducted IS DISTINCT FROM COALESCE(OLD.total_coins_deducted, NEW.total_coins_deducted)
     OR NEW.host_earned          IS DISTINCT FROM COALESCE(OLD.host_earned, NEW.host_earned)
     OR NEW.last_billed_minute   IS DISTINCT FROM COALESCE(OLD.last_billed_minute, NEW.last_billed_minute)
     OR NEW.total_minutes_billed IS DISTINCT FROM COALESCE(OLD.total_minutes_billed, NEW.total_minutes_billed)
     OR NEW.viewer_rate_per_min  IS DISTINCT FROM COALESCE(OLD.viewer_rate_per_min, NEW.viewer_rate_per_min)
     OR NEW.host_rate_per_min    IS DISTINCT FROM COALESCE(OLD.host_rate_per_min, NEW.host_rate_per_min)
     OR NEW.platform_cut_percent IS DISTINCT FROM COALESCE(OLD.platform_cut_percent, NEW.platform_cut_percent)
     OR NEW.last_billing_at      IS DISTINCT FROM COALESCE(OLD.last_billing_at, NEW.last_billing_at)
     OR NEW.connected_at         IS DISTINCT FROM COALESCE(OLD.connected_at, NEW.connected_at)
     OR NEW.accepted_at          IS DISTINCT FROM COALESCE(OLD.accepted_at, NEW.accepted_at)
     OR NEW.ended_at             IS DISTINCT FROM COALESCE(OLD.ended_at, NEW.ended_at)
     OR NEW.is_reconnecting      IS DISTINCT FROM COALESCE(OLD.is_reconnecting, NEW.is_reconnecting)
     OR NEW.reconnecting_since   IS DISTINCT FROM COALESCE(OLD.reconnecting_since, NEW.reconnecting_since)
  THEN
    RAISE EXCEPTION 'private_calls: server-owned column cannot be written by client (use accept_private_call / end_private_call / bill_call_minute / settle_private_call / mark_call_reconnecting)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. New SECURITY DEFINER RPC for clients to flag reconnect state.
CREATE OR REPLACE FUNCTION public.mark_call_reconnecting(p_call_id uuid, p_reconnecting boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _call record;
  _auth uuid := auth.uid();
BEGIN
  IF _auth IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _call FROM public.private_calls WHERE id = p_call_id FOR UPDATE;
  IF _call IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  IF _auth NOT IN (_call.caller_id, _call.host_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _call.status <> 'connected' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_connected', 'status', _call.status);
  END IF;

  IF p_reconnecting THEN
    UPDATE public.private_calls
       SET is_reconnecting    = true,
           reconnecting_since = COALESCE(reconnecting_since, now()),
           updated_at         = now()
     WHERE id = p_call_id;

    BEGIN
      INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
      VALUES (p_call_id, 'reconnect_started', jsonb_build_object('by', _auth), now());
    EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSE
    UPDATE public.private_calls
       SET is_reconnecting    = false,
           reconnecting_since = NULL,
           updated_at         = now()
     WHERE id = p_call_id;

    BEGIN
      INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
      VALUES (p_call_id, 'reconnect_recovered', jsonb_build_object('by', _auth), now());
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object('success', true, 'is_reconnecting', p_reconnecting);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_call_reconnecting(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_call_reconnecting(uuid, boolean) TO authenticated, service_role;

-- 6. Update bill_call_minute to PAUSE while is_reconnecting=true.
CREATE OR REPLACE FUNCTION public.bill_call_minute(p_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _call               record;
  _next_minute        integer;
  _seconds_elapsed    integer;
  _required_seconds   integer;
  _viewer_rate        bigint;
  _host_rate          bigint;
  _platform_pct       numeric;
  _settings_text      text;
  _settings           jsonb := '{}'::jsonb;
  _commission_pct     numeric;
  _grace_seconds      integer;
  _rows               integer;
BEGIN
  SELECT *
    INTO _call
    FROM public.private_calls
   WHERE id = p_call_id
   FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'locked_or_not_found');
  END IF;

  IF _call.status <> 'connected' THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'not_connected', 'status', _call.status);
  END IF;

  IF _call.connected_at IS NULL THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'no_connected_at');
  END IF;

  -- Pause billing while a participant flagged the call as reconnecting.
  IF COALESCE(_call.is_reconnecting, false) = true THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'reconnecting',
                              'since', _call.reconnecting_since);
  END IF;

  -- Hydrate frozen rates on first invocation (back-fill old rows)
  IF _call.viewer_rate_per_min IS NULL
     OR _call.host_rate_per_min IS NULL
     OR _call.platform_cut_percent IS NULL THEN

    SELECT setting_value INTO _settings_text
      FROM public.app_settings
     WHERE setting_key = 'call_rates';

    IF _settings_text IS NOT NULL AND btrim(_settings_text) <> '' THEN
      BEGIN _settings := _settings_text::jsonb; EXCEPTION WHEN OTHERS THEN _settings := '{}'::jsonb; END;
    END IF;

    BEGIN
      _commission_pct := NULLIF((_settings->>'host_commission_percent'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN _commission_pct := NULL; END;

    _viewer_rate  := COALESCE(_call.coins_per_minute, 0)::bigint;
    _platform_pct := COALESCE(_commission_pct, 70);
    _host_rate    := FLOOR(_viewer_rate::numeric * _platform_pct / 100.0)::bigint;

    UPDATE public.private_calls
       SET viewer_rate_per_min  = COALESCE(viewer_rate_per_min, _viewer_rate),
           host_rate_per_min    = COALESCE(host_rate_per_min,   _host_rate),
           platform_cut_percent = COALESCE(platform_cut_percent, _platform_pct),
           updated_at           = now()
     WHERE id = p_call_id;

    _call.viewer_rate_per_min  := COALESCE(_call.viewer_rate_per_min,  _viewer_rate);
    _call.host_rate_per_min    := COALESCE(_call.host_rate_per_min,    _host_rate);
    _call.platform_cut_percent := COALESCE(_call.platform_cut_percent, _platform_pct);
  END IF;

  _viewer_rate := _call.viewer_rate_per_min;
  _host_rate   := _call.host_rate_per_min;
  _grace_seconds := COALESCE(_call.connect_grace_seconds, 5);

  _seconds_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (now() - _call.connected_at))::integer - _grace_seconds);
  _next_minute := COALESCE(_call.last_billed_minute, 0) + 1;
  _required_seconds := (_next_minute - 1) * 60 + 1;

  IF _seconds_elapsed < _required_seconds THEN
    RETURN jsonb_build_object('billed', false, 'reason', 'not_yet',
                              'seconds_elapsed', _seconds_elapsed,
                              'required_seconds', _required_seconds);
  END IF;

  -- Atomic deduction (caller balance check)
  UPDATE public.profiles
     SET coins             = coins - _viewer_rate,
         total_consumption = COALESCE(total_consumption, 0) + _viewer_rate,
         updated_at        = now()
   WHERE id = _call.caller_id
     AND COALESCE(coins, 0) >= _viewer_rate;

  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows = 0 THEN
    UPDATE public.private_calls
       SET status     = 'ended',
           ended_at   = now(),
           end_reason = 'low_balance',
           updated_at = now()
     WHERE id = p_call_id;

    BEGIN
      INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
      VALUES (p_call_id, 'call_ended', jsonb_build_object('end_reason', 'low_balance'), now());
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object('billed', false, 'reason', 'low_balance');
  END IF;

  IF _host_rate > 0 THEN
    UPDATE public.profiles
       SET beans            = COALESCE(beans, 0)            + _host_rate,
           total_earnings   = COALESCE(total_earnings, 0)   + _host_rate,
           weekly_earnings  = COALESCE(weekly_earnings, 0)  + _host_rate,
           pending_earnings = COALESCE(pending_earnings, 0) + _host_rate,
           updated_at       = now()
     WHERE id = _call.host_id;
  END IF;

  INSERT INTO public.billing_ledger
    (call_id, minute_number, caller_id, host_id, viewer_deducted, host_credited, source)
  VALUES
    (p_call_id, _next_minute, _call.caller_id, _call.host_id, _viewer_rate, _host_rate, 'server_tick')
  ON CONFLICT (call_id, minute_number) DO NOTHING;

  UPDATE public.private_calls
     SET last_billed_minute    = _next_minute,
         total_minutes_billed  = COALESCE(total_minutes_billed, 0) + 1,
         total_coins_deducted  = COALESCE(total_coins_deducted, 0) + _viewer_rate,
         host_earned           = COALESCE(host_earned, 0) + _host_rate,
         last_billing_at       = now(),
         updated_at            = now()
   WHERE id = p_call_id;

  BEGIN
    INSERT INTO public.call_events (call_id, event_type, event_data, created_at)
    VALUES (
      p_call_id,
      'minute_charged_server',
      jsonb_build_object(
        'minute_number',   _next_minute,
        'viewer_deducted', _viewer_rate,
        'host_credited',   _host_rate,
        'source',          'server_tick'
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'billed',          true,
    'minute_number',   _next_minute,
    'viewer_deducted', _viewer_rate,
    'host_credited',   _host_rate,
    'source',          'server_tick'
  );
END;
$function$;

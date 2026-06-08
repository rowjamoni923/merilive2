
-- ============================================================
-- Phase 3B Step 1 — Server-side per-minute billing foundation
-- Additive only. Existing client-side path keeps working.
-- NOTE: private_calls has no PK on id, so we use an indexed UUID
--       column (not a FK) on billing_ledger.
-- ============================================================

-- 1) Add new columns to private_calls (all defaulted)
ALTER TABLE public.private_calls
  ADD COLUMN IF NOT EXISTS last_billed_minute    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_minutes_billed  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS viewer_rate_per_min   BIGINT,
  ADD COLUMN IF NOT EXISTS host_rate_per_min     BIGINT,
  ADD COLUMN IF NOT EXISTS platform_cut_percent  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS connect_grace_seconds INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS final_status          TEXT;

CREATE INDEX IF NOT EXISTS idx_private_calls_active_billing
  ON public.private_calls (status, connected_at)
  WHERE status = 'connected';

-- 2) Append-only billing ledger (per-minute audit + idempotency)
CREATE TABLE IF NOT EXISTS public.billing_ledger (
  id               BIGSERIAL PRIMARY KEY,
  call_id          UUID    NOT NULL,
  minute_number    INTEGER NOT NULL,
  caller_id        UUID    NOT NULL,
  host_id          UUID    NOT NULL,
  viewer_deducted  BIGINT  NOT NULL DEFAULT 0,
  host_credited    BIGINT  NOT NULL DEFAULT 0,
  source           TEXT    NOT NULL DEFAULT 'server_tick',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_ledger_unique_minute UNIQUE (call_id, minute_number)
);

CREATE INDEX IF NOT EXISTS idx_billing_ledger_call_id ON public.billing_ledger (call_id);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_caller  ON public.billing_ledger (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_ledger_host    ON public.billing_ledger (host_id,   created_at DESC);

GRANT SELECT ON public.billing_ledger TO authenticated;
GRANT ALL    ON public.billing_ledger TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.billing_ledger_id_seq TO service_role;

ALTER TABLE public.billing_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can read their own ledger rows" ON public.billing_ledger;
CREATE POLICY "Participants can read their own ledger rows"
  ON public.billing_ledger
  FOR SELECT
  TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = host_id);

-- 3) bill_call_minute(call_id) — authoritative server-side biller
CREATE OR REPLACE FUNCTION public.bill_call_minute(p_call_id UUID)
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

    IF _commission_pct IS NULL OR _commission_pct < 0 OR _commission_pct > 100 THEN
      _commission_pct := 70;
    END IF;

    _viewer_rate  := GREATEST(COALESCE(_call.coins_per_minute, 60), 0)::bigint;
    _host_rate    := FLOOR(_viewer_rate::numeric * _commission_pct / 100.0)::bigint;
    _platform_pct := 100 - _commission_pct;

    UPDATE public.private_calls
       SET viewer_rate_per_min  = _viewer_rate,
           host_rate_per_min    = _host_rate,
           platform_cut_percent = _platform_pct,
           updated_at           = now()
     WHERE id = p_call_id;
  ELSE
    _viewer_rate  := _call.viewer_rate_per_min;
    _host_rate    := _call.host_rate_per_min;
    _platform_pct := _call.platform_cut_percent;
  END IF;

  _grace_seconds    := COALESCE(_call.connect_grace_seconds, 5);
  _next_minute      := COALESCE(_call.last_billed_minute, 0) + 1;
  _seconds_elapsed  := EXTRACT(EPOCH FROM (now() - _call.connected_at))::integer;
  _required_seconds := _grace_seconds + (_next_minute - 1) * 60;

  IF _seconds_elapsed < _required_seconds THEN
    RETURN jsonb_build_object(
      'billed', false,
      'reason', 'too_early',
      'next_minute', _next_minute,
      'seconds_elapsed', _seconds_elapsed,
      'seconds_required', _required_seconds
    );
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET coins             = COALESCE(coins, 0) - _viewer_rate,
         total_consumption = COALESCE(total_consumption, 0) + _viewer_rate,
         updated_at        = now()
   WHERE id = _call.caller_id
     AND COALESCE(coins, 0) >= _viewer_rate;

  GET DIAGNOSTICS _rows = ROW_COUNT;

  IF _rows = 0 THEN
    UPDATE public.private_calls
       SET status       = 'ended',
           ended_at     = now(),
           end_reason   = 'insufficient_coins',
           final_status = 'insufficient_balance',
           updated_at   = now()
     WHERE id = p_call_id;

    BEGIN PERFORM public.settle_private_call(p_call_id); EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN jsonb_build_object(
      'billed', false,
      'reason', 'insufficient_balance',
      'call_ended', true
    );
  END IF;

  IF _host_rate > 0 THEN
    UPDATE public.profiles
       SET beans            = COALESCE(beans, 0) + _host_rate,
           weekly_earnings  = COALESCE(weekly_earnings, 0) + _host_rate,
           total_earnings   = COALESCE(total_earnings, 0) + _host_rate,
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

REVOKE ALL ON FUNCTION public.bill_call_minute(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bill_call_minute(uuid) TO service_role;

COMMENT ON FUNCTION public.bill_call_minute(uuid) IS
  'Phase 3B server-side per-minute biller. SECURITY DEFINER, service_role only. Idempotent via billing_ledger UNIQUE(call_id, minute_number). Skips locked rows. Auto-ends call on insufficient balance.';

-- 4) Helper for the cron tick to find billable calls
CREATE OR REPLACE FUNCTION public.get_billable_call_ids()
RETURNS TABLE (call_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id
    FROM public.private_calls
   WHERE status = 'connected'
     AND connected_at IS NOT NULL
     AND connected_at
         + (COALESCE(connect_grace_seconds, 5)
            + COALESCE(last_billed_minute, 0) * 60) * INTERVAL '1 second'
         <= now();
$$;

REVOKE ALL ON FUNCTION public.get_billable_call_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_billable_call_ids() TO service_role;

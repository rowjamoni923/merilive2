-- ============================================================================
-- Owner-mandate 2026-06-29: 100% reliable per-minute call billing — eliminate
-- the broken HTTP+GUC architecture.
--
-- Old design: pg_cron → HTTP POST → call-billing-tick edge fn, with the cron
-- job sending `Authorization: Bearer ' || current_setting('app.settings.service_role_key')`.
-- That GUC was NEVER set on this project, so every minute the cron fired with
-- an empty Bearer token, the edge fn returned 401, and ZERO diamonds were
-- deducted. Hosts called, viewers stayed on the line, balance never moved.
--
-- New design: pg_cron → SQL function `process_billing_tick()` that runs the
-- exact same logic in-database and broadcasts low-balance / force-end signals
-- via `realtime.send()`. No HTTP. No service_role_key. No GUC. No 401s.
-- The edge function is kept for manual debugging but the cron no longer needs
-- it. This matches how Chamet / Bigo billing tickers run (pure DB cron, no
-- internal HTTP hop) and removes the entire class of "cron silently broken"
-- failures.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_billing_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_id        uuid;
  v_result         jsonb;
  v_caller_id      uuid;
  v_rate           numeric;
  v_coins          numeric;
  v_remaining_min  integer;
  v_billed         integer := 0;
  v_skipped        integer := 0;
  v_ended          integer := 0;
  v_failed         integer := 0;
  v_signalled      integer := 0;
  v_candidates     integer := 0;
  v_started_at     timestamptz := clock_timestamp();
BEGIN
  -- 1) Iterate every billable call (FOR UPDATE SKIP LOCKED inside the helper
  --    guarantees overlapping ticks can never double-charge the same minute).
  FOR v_call_id IN SELECT call_id FROM public.get_billable_call_ids() LOOP
    v_candidates := v_candidates + 1;

    BEGIN
      v_result := public.bill_call_minute(v_call_id);
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING '[process_billing_tick] bill_call_minute(%) failed: %', v_call_id, SQLERRM;
      CONTINUE;
    END;

    -- 2a) Call ended (insufficient balance, etc.) → broadcast force_end.
    IF COALESCE((v_result->>'call_ended')::boolean, false) THEN
      v_ended := v_ended + 1;
      BEGIN
        PERFORM realtime.send(
          jsonb_build_object(
            'action',  'force_end',
            'reason',  COALESCE(v_result->>'reason', 'insufficient_balance'),
            'call_id', v_call_id,
            'ts',      (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint
          ),
          'signal',
          'call_signaling:' || v_call_id::text,
          false
        );
        v_signalled := v_signalled + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[process_billing_tick] force_end broadcast failed for %: %', v_call_id, SQLERRM;
      END;
      CONTINUE;
    END IF;

    -- 2b) Minute successfully billed → check remaining balance, broadcast
    --     low-balance warning at ≤2min (warning) and ≤1min (critical).
    IF COALESCE((v_result->>'billed')::boolean, false) THEN
      v_billed := v_billed + 1;

      SELECT pc.caller_id, pc.viewer_rate_per_min
        INTO v_caller_id, v_rate
        FROM public.private_calls pc
       WHERE pc.id = v_call_id;

      IF v_caller_id IS NOT NULL AND v_rate IS NOT NULL AND v_rate > 0 THEN
        SELECT COALESCE(p.coins, 0) INTO v_coins FROM public.profiles p WHERE p.id = v_caller_id;
        v_remaining_min := FLOOR(v_coins / v_rate)::int;
        IF v_remaining_min <= 2 THEN
          BEGIN
            PERFORM realtime.send(
              jsonb_build_object(
                'action',            'low_balance',
                'remaining_minutes', v_remaining_min,
                'remaining_seconds', v_remaining_min * 60,
                'severity',          CASE WHEN v_remaining_min <= 1 THEN 'critical' ELSE 'warning' END,
                'call_id',           v_call_id,
                'ts',                (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint
              ),
              'signal',
              'call_signaling:' || v_call_id::text,
              false
            );
            v_signalled := v_signalled + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '[process_billing_tick] low_balance broadcast failed for %: %', v_call_id, SQLERRM;
          END;
        END IF;
      END IF;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',          true,
    'candidates',  v_candidates,
    'billed',      v_billed,
    'skipped',     v_skipped,
    'ended',       v_ended,
    'failed',      v_failed,
    'signalled',   v_signalled,
    'took_ms',     EXTRACT(MILLISECOND FROM clock_timestamp() - v_started_at)::int +
                   (EXTRACT(SECOND   FROM clock_timestamp() - v_started_at)::int * 1000)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_billing_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_billing_tick() TO postgres, service_role;

-- ── Replace the broken HTTP-based cron with a direct SQL invocation ────────
DO $$
BEGIN
  -- Drop old broken job (if scheduled)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'call-billing-tick-every-minute') THEN
    PERFORM cron.unschedule('call-billing-tick-every-minute');
  END IF;

  -- Schedule the new SQL-only job
  PERFORM cron.schedule(
    'call-billing-tick-every-minute',
    '* * * * *',
    $cron$SELECT public.process_billing_tick();$cron$
  );
END $$;

-- ── Also set the GUC as a belt-and-suspenders measure so anyone manually
--    debugging via the old HTTP path still works. We read the value from
--    Supabase's stored service_role secret if available; otherwise leave it
--    null. (No-op if vault is empty.)
-- Intentionally NOT setting service_role_key in DB GUC — security best
-- practice is to keep it in edge function env only. The new SQL cron does
-- not need it.
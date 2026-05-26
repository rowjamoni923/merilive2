
-- ============================================================================
-- 1. Replace process_weekly_agency_transfers: ONLY host earnings -> wallet_balance
--    Commission is now strictly the job of process_agency_commission_distribution
--    (delayed by 1+ hour, based on transferred totals).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host RECORD;
  _agency_count integer := 0;
  _solo_count integer := 0;
  _total_to_agency_wallet bigint := 0;
  _total_to_solo_personal bigint := 0;
  _period_start timestamp;
  _period_end timestamp;
  _host_earning bigint;
  _caller text;
BEGIN
  _caller := COALESCE(auth.role(), '');
  IF _caller <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: weekly transfer is service/admin only';
  END IF;

  _period_start := date_trunc('week', now() - interval '7 days');
  _period_end   := date_trunc('week', now());

  -- Path A: agency-attached hosts -> earnings into agency wallet (Total Beans)
  FOR _host IN
    SELECT p.id, p.display_name, p.app_uid,
           ah.agency_id, a.name AS agency_name,
           COALESCE(p.pending_earnings, 0)::bigint AS pending
      FROM public.profiles p
      JOIN public.agency_hosts ah ON ah.host_id = p.id AND ah.status = 'active'
      JOIN public.agencies a      ON a.id = ah.agency_id AND a.is_active = true
     WHERE COALESCE(p.pending_earnings, 0) > 0
  LOOP
    _host_earning := _host.pending;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET pending_earnings = 0,
           weekly_earnings  = 0,
           updated_at = now()
     WHERE id = _host.id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
    UPDATE public.agencies
       SET wallet_balance = COALESCE(wallet_balance, 0) + _host_earning,
           updated_at = now()
     WHERE id = _host.agency_id;
    PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);

    INSERT INTO public.agency_earnings_transfers (
      agency_id, host_id, host_name, host_uid, amount,
      commission_rate, transfer_type, status,
      period_start, period_end, agency_name, notes
    )
    VALUES (
      _host.agency_id, _host.id, _host.display_name, _host.app_uid,
      _host_earning, 0, 'weekly_auto', 'completed',
      _period_start, _period_end, _host.agency_name,
      'Weekly host earnings transferred to agency Total Beans. Commission paid separately after delay.'
    );

    _total_to_agency_wallet := _total_to_agency_wallet + _host_earning;
    _agency_count := _agency_count + 1;
  END LOOP;

  -- Path B: solo hosts (no active agency) -> personal beans (legacy)
  FOR _host IN
    SELECT p.id, COALESCE(p.pending_earnings, 0)::bigint AS pending
      FROM public.profiles p
     WHERE COALESCE(p.pending_earnings, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.agency_hosts ah
          JOIN public.agencies a ON a.id = ah.agency_id AND a.is_active = true
         WHERE ah.host_id = p.id AND ah.status = 'active'
       )
  LOOP
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET beans = COALESCE(beans, 0) + _host.pending,
           pending_earnings = 0,
           weekly_earnings  = 0,
           updated_at = now()
     WHERE id = _host.id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    _total_to_solo_personal := _total_to_solo_personal + _host.pending;
    _solo_count := _solo_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'agency_hosts_processed', _agency_count,
    'solo_hosts_processed', _solo_count,
    'total_to_agency_wallet', _total_to_agency_wallet,
    'total_to_solo_personal', _total_to_solo_personal,
    'period_start', _period_start,
    'period_end', _period_end,
    'note', 'Host earnings -> agency Total Beans only. Commission is paid by process_agency_commission_distribution after configured delay.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_weekly_agency_transfers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_weekly_agency_transfers() TO service_role;

-- ============================================================================
-- 2. Rewrite commission distribution: credit wallet_balance (Total Beans),
--    based on total host earnings transferred per agency per week.
--    Self-rate = tier rate from agency's own weekly USD volume.
--    Upper bonus = (parent tier rate - child tier rate) on the same volume.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.process_agency_commission_distribution(_since timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bucket RECORD;
  _agency_total bigint;
  _usd numeric;
  _own_rate numeric;
  _own_level text;
  _own_commission bigint;
  _parent_id uuid;
  _parent_usd numeric;
  _parent_rate numeric;
  _parent_level text;
  _bonus_rate numeric;
  _bonus_amount bigint;
  _child_rate numeric;
  _depth int;
  _beans_per_usd numeric;
  _cutoff TIMESTAMPTZ;
  _agencies_credited int := 0;
  _own_total bigint := 0;
  _bonus_total bigint := 0;
  _bonus_count int := 0;
  _buckets_processed int := 0;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: commission distribution is service/admin only';
  END IF;

  _cutoff := COALESCE(_since, now() - interval '90 days');
  _beans_per_usd := public.get_beans_per_usd();

  -- Only aggregate the host-earnings rows, not commission rows themselves.
  FOR _bucket IN
    SELECT
      agency_id,
      date_trunc('week', created_at)::date AS period_start,
      SUM(amount)::bigint AS total_beans
    FROM public.agency_earnings_transfers
    WHERE commission_processed_at IS NULL
      AND status = 'completed'
      AND transfer_type = 'weekly_auto'
      AND created_at >= _cutoff
      AND amount > 0
    GROUP BY agency_id, date_trunc('week', created_at)::date
  LOOP
    _buckets_processed := _buckets_processed + 1;
    _agency_total := _bucket.total_beans;
    _usd := _agency_total::numeric / NULLIF(_beans_per_usd, 0);

    SELECT level_code, commission_rate INTO _own_level, _own_rate
    FROM public.get_agency_tier_rate_for_usd(_usd);

    IF _own_rate IS NOT NULL AND _own_rate > 0 THEN
      _own_commission := FLOOR(_agency_total::numeric * _own_rate / 100.0)::bigint;
      IF _own_commission > 0 THEN
        INSERT INTO public.agency_commission_history (
          agency_id, host_id, transaction_type, original_amount,
          commission_rate, commission_amount, period_start, notes
        ) VALUES (
          _bucket.agency_id, NULL, 'weekly_aggregate', _agency_total,
          _own_rate, _own_commission, _bucket.period_start,
          'Weekly tier ' || COALESCE(_own_level,'?') || ' on $' || ROUND(_usd,2)
        )
        ON CONFLICT (agency_id, transaction_type, period_start)
          WHERE period_start IS NOT NULL
            AND transaction_type IN ('weekly_aggregate','upper_referral_bonus')
          DO NOTHING;

        IF FOUND THEN
          PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
          UPDATE public.agencies
            SET wallet_balance = COALESCE(wallet_balance,0) + _own_commission,
                updated_at = now()
            WHERE id = _bucket.agency_id;
          PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);

          INSERT INTO public.agency_earnings_transfers (
            agency_id, host_id, host_name, host_uid, amount,
            commission_rate, transfer_type, status,
            period_start, period_end, agency_name, notes,
            commission_processed_at
          )
          SELECT _bucket.agency_id, NULL, NULL, NULL,
                 _own_commission, _own_rate, 'weekly_commission', 'completed',
                 _bucket.period_start::timestamp,
                 (_bucket.period_start + interval '7 days')::timestamp,
                 a.name,
                 'Agency commission tier ' || COALESCE(_own_level,'?') || ' on $' || ROUND(_usd,2) || ' (into Total Beans).',
                 now()
            FROM public.agencies a WHERE a.id = _bucket.agency_id;

          _own_total := _own_total + _own_commission;
          _agencies_credited := _agencies_credited + 1;
        END IF;
      END IF;
    END IF;

    -- Upper-chain override bonus
    _child_rate := COALESCE(_own_rate, 0);
    _depth := 0;
    SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _bucket.agency_id;

    WHILE _parent_id IS NOT NULL AND _depth < 5 LOOP
      _depth := _depth + 1;

      SELECT COALESCE(SUM(amount),0)::numeric / NULLIF(_beans_per_usd,0)
        INTO _parent_usd
      FROM public.agency_earnings_transfers
      WHERE agency_id = _parent_id
        AND status = 'completed'
        AND transfer_type = 'weekly_auto'
        AND date_trunc('week', created_at)::date = _bucket.period_start;

      SELECT level_code, commission_rate INTO _parent_level, _parent_rate
      FROM public.get_agency_tier_rate_for_usd(_parent_usd);

      IF _parent_rate IS NOT NULL AND _parent_rate > _child_rate THEN
        _bonus_rate := _parent_rate - _child_rate;
        _bonus_amount := FLOOR(_agency_total::numeric * _bonus_rate / 100.0)::bigint;
        IF _bonus_amount > 0 THEN
          INSERT INTO public.agency_commission_history (
            agency_id, host_id, transaction_type, original_amount,
            commission_rate, commission_amount, period_start, notes
          ) VALUES (
            _parent_id, NULL, 'upper_referral_bonus', _agency_total,
            _bonus_rate, _bonus_amount, _bucket.period_start,
            'Upper bonus depth ' || _depth || ' (parent tier ' || COALESCE(_parent_level,'?') || ')'
          )
          ON CONFLICT (agency_id, transaction_type, period_start)
            WHERE period_start IS NOT NULL
              AND transaction_type IN ('weekly_aggregate','upper_referral_bonus')
            DO NOTHING;

          IF FOUND THEN
            PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
            UPDATE public.agencies
              SET wallet_balance = COALESCE(wallet_balance,0) + _bonus_amount,
                  updated_at = now()
              WHERE id = _parent_id;
            PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);

            INSERT INTO public.agency_earnings_transfers (
              agency_id, host_id, host_name, host_uid, amount,
              commission_rate, transfer_type, status,
              period_start, period_end, agency_name, notes,
              commission_processed_at
            )
            SELECT _parent_id, NULL, NULL, NULL,
                   _bonus_amount, _bonus_rate, 'weekly_override', 'completed',
                   _bucket.period_start::timestamp,
                   (_bucket.period_start + interval '7 days')::timestamp,
                   a.name,
                   'Upper override depth ' || _depth || ' (parent tier ' || COALESCE(_parent_level,'?') || ') into Total Beans.',
                   now()
              FROM public.agencies a WHERE a.id = _parent_id;

            _bonus_total := _bonus_total + _bonus_amount;
            _bonus_count := _bonus_count + 1;
          END IF;
        END IF;
        _child_rate := _parent_rate;
      END IF;

      SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _parent_id;
    END LOOP;

    -- Mark host-earning rows for this (agency, week) as commission-processed
    UPDATE public.agency_earnings_transfers
      SET commission_processed_at = now()
      WHERE agency_id = _bucket.agency_id
        AND date_trunc('week', created_at)::date = _bucket.period_start
        AND transfer_type = 'weekly_auto'
        AND commission_processed_at IS NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'buckets_processed', _buckets_processed,
    'agencies_credited', _agencies_credited,
    'transfers_processed', _agencies_credited,
    'own_commission_total', _own_total,
    'upper_bonuses_count', _bonus_count,
    'upper_bonus_total', _bonus_total,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_agency_commission_distribution(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_agency_commission_distribution(timestamptz) TO service_role;

-- ============================================================================
-- 3. Server-side scheduler ticks (run every minute via pg_cron).
--    Reads schedule from app_settings.transfer_schedule / commission_schedule.
--    transfer_schedule shape:
--      { is_active, schedule_day_of_week (0-6, 0=Sun), schedule_hour (0-23),
--        schedule_minute (0-59), timezone, last_transfer_at, next_transfer_at }
--    commission_schedule shape:
--      { is_active, delay_hours_after_transfer, next_run_at, last_run_at, last_result }
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tick_agency_weekly_scheduler()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _raw text;
  _cfg jsonb;
  _tz text;
  _dow int;
  _hour int;
  _minute int;
  _is_active boolean;
  _last_at timestamptz;
  _now_local timestamp;
  _now_dow int;
  _result jsonb;
  _comm_raw text;
  _comm jsonb;
  _delay int;
BEGIN
  SELECT setting_value::text INTO _raw FROM public.app_settings WHERE setting_key = 'transfer_schedule';
  IF _raw IS NULL THEN
    RETURN jsonb_build_object('skipped','no_schedule');
  END IF;

  BEGIN
    _cfg := _raw::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('skipped','bad_json');
  END;

  _is_active := COALESCE((_cfg->>'is_active')::boolean, false);
  IF NOT _is_active THEN
    RETURN jsonb_build_object('skipped','inactive');
  END IF;

  _tz     := COALESCE(NULLIF(_cfg->>'timezone',''), 'UTC');
  _dow    := COALESCE((_cfg->>'schedule_day_of_week')::int, 1);   -- 0..6
  _hour   := COALESCE((_cfg->>'schedule_hour')::int, 0);
  _minute := COALESCE((_cfg->>'schedule_minute')::int, 0);
  _last_at := NULLIF(_cfg->>'last_transfer_at','')::timestamptz;

  -- Anti-double-fire: must be at least 6 days since last run
  IF _last_at IS NOT NULL AND _last_at > now() - interval '6 days' THEN
    RETURN jsonb_build_object('skipped','too_recent','last_at',_last_at);
  END IF;

  -- Compute current wall-clock in the configured timezone
  BEGIN
    _now_local := (now() AT TIME ZONE _tz);
  EXCEPTION WHEN OTHERS THEN
    _now_local := (now() AT TIME ZONE 'UTC');
    _tz := 'UTC';
  END;
  _now_dow := EXTRACT(DOW FROM _now_local)::int;

  -- Match weekday + hour + minute (minute window: exact minute only, cron runs every min)
  IF _now_dow <> _dow
     OR EXTRACT(HOUR   FROM _now_local)::int <> _hour
     OR EXTRACT(MINUTE FROM _now_local)::int <> _minute THEN
    RETURN jsonb_build_object('skipped','not_due','now_dow',_now_dow,'now_local',_now_local);
  END IF;

  -- Fire the transfer
  _result := public.process_weekly_agency_transfers();

  -- Stamp last_transfer_at + schedule commission distribution
  SELECT setting_value::text INTO _comm_raw FROM public.app_settings WHERE setting_key = 'commission_schedule';
  BEGIN _comm := COALESCE(_comm_raw::jsonb, '{}'::jsonb); EXCEPTION WHEN OTHERS THEN _comm := '{}'::jsonb; END;
  _delay := COALESCE((_comm->>'delay_hours_after_transfer')::int, 1);
  IF _delay < 1 THEN _delay := 1; END IF;

  UPDATE public.app_settings
     SET setting_value = ((_cfg
           || jsonb_build_object('last_transfer_at', to_jsonb(now()))
           || jsonb_build_object('last_result', _result))::text)::text,
         updated_at = now()
   WHERE setting_key = 'transfer_schedule';

  UPDATE public.app_settings
     SET setting_value = ((_comm
           || jsonb_build_object('is_active', COALESCE((_comm->>'is_active')::boolean, true))
           || jsonb_build_object('delay_hours_after_transfer', _delay)
           || jsonb_build_object('next_run_at', to_jsonb(now() + make_interval(hours => _delay))))::text)::text,
         updated_at = now()
   WHERE setting_key = 'commission_schedule';

  RETURN jsonb_build_object('fired', true, 'result', _result, 'commission_in_hours', _delay);
END;
$$;

REVOKE ALL ON FUNCTION public.tick_agency_weekly_scheduler() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_agency_weekly_scheduler() TO service_role;

CREATE OR REPLACE FUNCTION public.tick_agency_commission_scheduler()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _raw text;
  _cfg jsonb;
  _is_active boolean;
  _next_at timestamptz;
  _result jsonb;
BEGIN
  SELECT setting_value::text INTO _raw FROM public.app_settings WHERE setting_key = 'commission_schedule';
  IF _raw IS NULL THEN
    RETURN jsonb_build_object('skipped','no_schedule');
  END IF;
  BEGIN _cfg := _raw::jsonb; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('skipped','bad_json'); END;

  _is_active := COALESCE((_cfg->>'is_active')::boolean, true);
  _next_at := NULLIF(_cfg->>'next_run_at','')::timestamptz;
  IF NOT _is_active OR _next_at IS NULL OR _next_at > now() THEN
    RETURN jsonb_build_object('skipped','not_due');
  END IF;

  _result := public.process_agency_commission_distribution();

  UPDATE public.app_settings
     SET setting_value = ((_cfg
           || jsonb_build_object('last_run_at', to_jsonb(now()))
           || jsonb_build_object('next_run_at', 'null'::jsonb)
           || jsonb_build_object('last_result', _result))::text)::text,
         updated_at = now()
   WHERE setting_key = 'commission_schedule';

  RETURN jsonb_build_object('fired', true, 'result', _result);
END;
$$;

REVOKE ALL ON FUNCTION public.tick_agency_commission_scheduler() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_agency_commission_scheduler() TO service_role;

-- ============================================================================
-- 4. Re-schedule pg_cron: replace the static Monday-00:05 transfer job with
--    two every-minute ticks that read the admin-configured weekday + time.
-- ============================================================================
DO $$
DECLARE
  _j record;
BEGIN
  FOR _j IN
    SELECT jobid FROM cron.job
     WHERE jobname IN ('process-weekly-agency-transfers',
                       'tick-agency-weekly-scheduler',
                       'tick-agency-commission-scheduler')
  LOOP
    PERFORM cron.unschedule(_j.jobid);
  END LOOP;
END$$;

SELECT cron.schedule(
  'tick-agency-weekly-scheduler',
  '* * * * *',
  $sql$SELECT public.tick_agency_weekly_scheduler();$sql$
);

SELECT cron.schedule(
  'tick-agency-commission-scheduler',
  '* * * * *',
  $sql$SELECT public.tick_agency_commission_scheduler();$sql$
);

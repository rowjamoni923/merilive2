-- Allow the weekly scheduler (pg_cron context, auth.role()=NULL) to call
-- process_weekly_agency_transfers() via a session-scoped trusted flag.

CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _scheduler_bypass boolean;
BEGIN
  _caller := COALESCE(auth.role(), '');
  BEGIN
    _scheduler_bypass := COALESCE(current_setting('app.weekly_transfer_scheduler', true), '') = 'true';
  EXCEPTION WHEN OTHERS THEN _scheduler_bypass := false; END;

  IF NOT _scheduler_bypass
     AND _caller <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: weekly transfer is service/admin only';
  END IF;

  _period_start := date_trunc('week', now() - interval '7 days');
  _period_end   := date_trunc('week', now());

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
    'period_end', _period_end
  );
END;
$function$;

-- Same bypass for the commission distribution function.
CREATE OR REPLACE FUNCTION public.process_agency_commission_distribution(_since timestamptz DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bucket RECORD;
  _group_usd numeric;
  _own_rate numeric;
  _own_level text;
  _own_commission bigint;
  _parent_id uuid;
  _parent_rate numeric;
  _bonus_rate numeric;
  _bonus_amount bigint;
  _child_rate numeric;
  _beans_per_usd numeric;
  _agencies_credited int := 0;
  _own_total bigint := 0;
  _bonus_total bigint := 0;
  _bonus_count int := 0;
  _is_helper_5 boolean;
  _hop int;
  _scheduler_bypass boolean;
BEGIN
  BEGIN
    _scheduler_bypass := COALESCE(current_setting('app.commission_scheduler', true), '') = 'true';
  EXCEPTION WHEN OTHERS THEN _scheduler_bypass := false; END;

  IF NOT _scheduler_bypass
     AND COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _beans_per_usd := public.get_beans_per_usd();

  FOR _bucket IN
    SELECT agency_id, date_trunc('week', created_at)::date AS period_start, SUM(amount)::bigint AS total_beans
    FROM public.agency_earnings_transfers
    WHERE commission_processed_at IS NULL
      AND status = 'completed'
      AND transfer_type = 'weekly_auto'
      AND (_since IS NULL OR created_at >= _since)
    GROUP BY agency_id, date_trunc('week', created_at)::date
  LOOP
    _group_usd := public.get_agency_group_volume_usd(_bucket.agency_id, _bucket.period_start);

    SELECT (level = 'A5' OR level = 'diamond') INTO _is_helper_5
    FROM public.agencies WHERE id = _bucket.agency_id;

    IF _is_helper_5 THEN
      _own_rate := 12.0;
      _own_level := 'Diamond (Fixed)';
    ELSE
      SELECT level_code, commission_rate INTO _own_level, _own_rate
      FROM public.get_agency_tier_rate_for_usd(_group_usd);
    END IF;

    IF _own_rate > 0 THEN
      _own_commission := FLOOR(_bucket.total_beans::numeric * _own_rate / 100.0)::bigint;

      INSERT INTO public.agency_commission_history (
        agency_id, transaction_type, original_amount, commission_rate, commission_amount, period_start, notes
      ) VALUES (
        _bucket.agency_id, 'weekly_aggregate', _bucket.total_beans, _own_rate, _own_commission, _bucket.period_start,
        format('Weekly Team Vol: $%s. Tier: %s', _group_usd, _own_level)
      ) ON CONFLICT DO NOTHING;

      IF FOUND THEN
        PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
        UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _own_commission WHERE id = _bucket.agency_id;
        PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);
        _own_total := _own_total + _own_commission;
        _agencies_credited := _agencies_credited + 1;
      END IF;
    END IF;

    _child_rate := COALESCE(_own_rate, 0);
    SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _bucket.agency_id;
    _hop := 0;

    WHILE _parent_id IS NOT NULL AND _hop < 5 LOOP
      _hop := _hop + 1;
      DECLARE
        _p_group_usd numeric;
        _p_is_h5 boolean;
      BEGIN
        _p_group_usd := public.get_agency_group_volume_usd(_parent_id, _bucket.period_start);
        SELECT (level = 'A5' OR level = 'diamond') INTO _p_is_h5 FROM public.agencies WHERE id = _parent_id;

        IF _p_is_h5 THEN
          _parent_rate := 12.0;
        ELSE
          SELECT commission_rate INTO _parent_rate FROM public.get_agency_tier_rate_for_usd(_p_group_usd);
        END IF;
      END;

      _bonus_rate := COALESCE(_parent_rate, 0) - _child_rate;

      IF _bonus_rate > 0 THEN
        _bonus_amount := FLOOR(_bucket.total_beans::numeric * _bonus_rate / 100.0)::bigint;

        INSERT INTO public.agency_commission_history (
          agency_id, transaction_type, original_amount, commission_rate, commission_amount, period_start, notes
        ) VALUES (
          _parent_id, 'upper_referral_bonus', _bucket.total_beans, _bonus_rate, _bonus_amount, _bucket.period_start,
          format('Override from Sub-agency. Rate Diff: %s%% - %s%%', _parent_rate, _child_rate)
        ) ON CONFLICT DO NOTHING;

        IF FOUND THEN
          PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
          UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _bonus_amount WHERE id = _parent_id;
          PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);
          _bonus_total := _bonus_total + _bonus_amount;
          _bonus_count := _bonus_count + 1;
        END IF;
      END IF;

      _child_rate := GREATEST(_child_rate, COALESCE(_parent_rate, 0));
      SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _parent_id;
    END LOOP;

    UPDATE public.agency_earnings_transfers
    SET commission_processed_at = now()
    WHERE agency_id = _bucket.agency_id
      AND date_trunc('week', created_at)::date = _bucket.period_start
      AND transfer_type = 'weekly_auto'
      AND commission_processed_at IS NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'agencies_credited', _agencies_credited,
    'own_commission_total', _own_total,
    'upper_bonus_total', _bonus_total,
    'upper_bonuses_count', _bonus_count
  );
END;
$function$;

-- Update the schedulers to set the bypass flag before invoking.
CREATE OR REPLACE FUNCTION public.tick_agency_weekly_scheduler()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _now_local_date date;
  _now_dow int;
  _days_back int;
  _target_date date;
  _scheduled_local timestamp;
  _scheduled_utc timestamptz;
  _result jsonb;
  _comm_raw text;
  _comm jsonb;
  _delay int;
  _out jsonb;
BEGIN
  SELECT setting_value::text INTO _raw FROM public.app_settings WHERE setting_key = 'transfer_schedule';
  IF _raw IS NULL THEN RETURN jsonb_build_object('skipped','no_schedule'); END IF;
  BEGIN _cfg := _raw::jsonb; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('skipped','bad_json'); END;

  _is_active := COALESCE((_cfg->>'is_active')::boolean, false);
  IF NOT _is_active THEN RETURN jsonb_build_object('skipped','inactive'); END IF;

  _tz     := COALESCE(NULLIF(_cfg->>'timezone',''), 'UTC');
  _dow    := COALESCE((_cfg->>'schedule_day_of_week')::int, 1);
  _hour   := COALESCE((_cfg->>'schedule_hour')::int, 0);
  _minute := COALESCE((_cfg->>'schedule_minute')::int, 0);
  _last_at := NULLIF(_cfg->>'last_transfer_at','')::timestamptz;

  BEGIN _now_local := (now() AT TIME ZONE _tz);
  EXCEPTION WHEN OTHERS THEN _now_local := (now() AT TIME ZONE 'UTC'); _tz := 'UTC'; END;

  _now_local_date := _now_local::date;
  _now_dow := EXTRACT(DOW FROM _now_local)::int;
  _days_back := (_now_dow - _dow + 7) % 7;
  _target_date := _now_local_date - (_days_back || ' days')::interval;
  _scheduled_local := _target_date + make_time(_hour, _minute, 0);
  IF _days_back = 0 AND _now_local < _scheduled_local THEN
    _scheduled_local := _scheduled_local - interval '7 days';
  END IF;
  _scheduled_utc := _scheduled_local AT TIME ZONE _tz;

  IF now() < _scheduled_utc THEN RETURN jsonb_build_object('skipped','not_due_time','scheduled_at',_scheduled_utc); END IF;
  IF _last_at IS NOT NULL AND _last_at >= _scheduled_utc THEN
    RETURN jsonb_build_object('skipped','already_fired','last_at',_last_at,'scheduled_at',_scheduled_utc);
  END IF;
  IF _last_at IS NOT NULL AND _last_at > now() - interval '6 days' THEN
    RETURN jsonb_build_object('skipped','too_recent','last_at',_last_at);
  END IF;

  -- Trusted scheduler bypass for the auth check inside the inner function
  PERFORM set_config('app.weekly_transfer_scheduler', 'true', true);
  _result := public.process_weekly_agency_transfers();
  PERFORM set_config('app.weekly_transfer_scheduler', 'false', true);

  SELECT setting_value::text INTO _comm_raw FROM public.app_settings WHERE setting_key = 'commission_schedule';
  BEGIN _comm := COALESCE(_comm_raw::jsonb, '{}'::jsonb); EXCEPTION WHEN OTHERS THEN _comm := '{}'::jsonb; END;
  _delay := COALESCE((_comm->>'delay_hours_after_transfer')::int, 1);
  IF _delay < 1 THEN _delay := 1; END IF;

  _out := jsonb_build_object('fired',true,'scheduled_at',_scheduled_utc,'result',_result,'commission_in_hours',_delay);

  UPDATE public.app_settings
     SET setting_value = ((_cfg
           || jsonb_build_object('last_transfer_at', to_jsonb(now()))
           || jsonb_build_object('last_scheduled_at', to_jsonb(_scheduled_utc))
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

  RETURN _out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tick_agency_commission_scheduler()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _raw text;
  _cfg jsonb;
  _is_active boolean;
  _next_at timestamptz;
  _result jsonb;
BEGIN
  SELECT setting_value::text INTO _raw FROM public.app_settings WHERE setting_key = 'commission_schedule';
  IF _raw IS NULL THEN RETURN jsonb_build_object('skipped','no_schedule'); END IF;
  BEGIN _cfg := _raw::jsonb; EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('skipped','bad_json'); END;

  _is_active := COALESCE((_cfg->>'is_active')::boolean, true);
  _next_at := NULLIF(_cfg->>'next_run_at','')::timestamptz;
  IF NOT _is_active OR _next_at IS NULL OR _next_at > now() THEN
    RETURN jsonb_build_object('skipped','not_due');
  END IF;

  PERFORM set_config('app.commission_scheduler', 'true', true);
  _result := public.process_agency_commission_distribution();
  PERFORM set_config('app.commission_scheduler', 'false', true);

  UPDATE public.app_settings
     SET setting_value = ((_cfg
           || jsonb_build_object('last_run_at', to_jsonb(now()))
           || jsonb_build_object('next_run_at', 'null'::jsonb)
           || jsonb_build_object('last_result', _result))::text)::text,
         updated_at = now()
   WHERE setting_key = 'commission_schedule';

  RETURN jsonb_build_object('fired', true, 'result', _result);
END;
$function$;

-- 1) Widen minute window (≤5 min after target)
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
  _now_dow int;
  _now_hour int;
  _now_minute int;
  _target_min_of_day int;
  _now_min_of_day int;
  _diff int;
  _result jsonb;
  _comm_raw text;
  _comm jsonb;
  _delay int;
BEGIN
  SELECT setting_value::text INTO _raw FROM public.app_settings WHERE setting_key = 'transfer_schedule';
  IF _raw IS NULL THEN
    RETURN jsonb_build_object('skipped','no_schedule');
  END IF;

  BEGIN _cfg := _raw::jsonb;
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('skipped','bad_json'); END;

  _is_active := COALESCE((_cfg->>'is_active')::boolean, false);
  IF NOT _is_active THEN RETURN jsonb_build_object('skipped','inactive'); END IF;

  _tz     := COALESCE(NULLIF(_cfg->>'timezone',''), 'UTC');
  _dow    := COALESCE((_cfg->>'schedule_day_of_week')::int, 1);
  _hour   := COALESCE((_cfg->>'schedule_hour')::int, 0);
  _minute := COALESCE((_cfg->>'schedule_minute')::int, 0);
  _last_at := NULLIF(_cfg->>'last_transfer_at','')::timestamptz;

  IF _last_at IS NOT NULL AND _last_at > now() - interval '6 days' THEN
    RETURN jsonb_build_object('skipped','too_recent','last_at',_last_at);
  END IF;

  BEGIN _now_local := (now() AT TIME ZONE _tz);
  EXCEPTION WHEN OTHERS THEN _now_local := (now() AT TIME ZONE 'UTC'); _tz := 'UTC'; END;

  _now_dow    := EXTRACT(DOW    FROM _now_local)::int;
  _now_hour   := EXTRACT(HOUR   FROM _now_local)::int;
  _now_minute := EXTRACT(MINUTE FROM _now_local)::int;

  IF _now_dow <> _dow THEN
    RETURN jsonb_build_object('skipped','not_due_day','now_dow',_now_dow,'target_dow',_dow);
  END IF;

  _target_min_of_day := _hour * 60 + _minute;
  _now_min_of_day    := _now_hour * 60 + _now_minute;
  _diff := _now_min_of_day - _target_min_of_day;

  -- Fire if we're between target minute and target+5 (handles cron jitter)
  IF _diff < 0 OR _diff > 5 THEN
    RETURN jsonb_build_object('skipped','not_due_time','diff_minutes',_diff,'now_local',_now_local);
  END IF;

  _result := public.process_weekly_agency_transfers();

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
$function$;

-- 2) Admin-only manual force-run
CREATE OR REPLACE FUNCTION public.force_run_weekly_agency_transfers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean;
  _result jsonb;
  _cfg_raw text;
  _cfg jsonb;
  _comm_raw text;
  _comm jsonb;
  _delay int;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT public.has_role(_caller, 'admin'::app_role) INTO _is_admin;
  IF NOT COALESCE(_is_admin, false) THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  _result := public.process_weekly_agency_transfers();

  SELECT setting_value::text INTO _cfg_raw FROM public.app_settings WHERE setting_key = 'transfer_schedule';
  BEGIN _cfg := COALESCE(_cfg_raw::jsonb, '{}'::jsonb); EXCEPTION WHEN OTHERS THEN _cfg := '{}'::jsonb; END;

  SELECT setting_value::text INTO _comm_raw FROM public.app_settings WHERE setting_key = 'commission_schedule';
  BEGIN _comm := COALESCE(_comm_raw::jsonb, '{}'::jsonb); EXCEPTION WHEN OTHERS THEN _comm := '{}'::jsonb; END;
  _delay := COALESCE((_comm->>'delay_hours_after_transfer')::int, 1);
  IF _delay < 1 THEN _delay := 1; END IF;

  UPDATE public.app_settings
     SET setting_value = ((_cfg
           || jsonb_build_object('last_transfer_at', to_jsonb(now()))
           || jsonb_build_object('last_result', _result)
           || jsonb_build_object('last_forced_by', to_jsonb(_caller)))::text)::text,
         updated_at = now()
   WHERE setting_key = 'transfer_schedule';

  UPDATE public.app_settings
     SET setting_value = ((_comm
           || jsonb_build_object('is_active', COALESCE((_comm->>'is_active')::boolean, true))
           || jsonb_build_object('delay_hours_after_transfer', _delay)
           || jsonb_build_object('next_run_at', to_jsonb(now() + make_interval(hours => _delay))))::text)::text,
         updated_at = now()
   WHERE setting_key = 'commission_schedule';

  RETURN jsonb_build_object('fired', true, 'forced', true, 'result', _result, 'commission_in_hours', _delay);
END;
$function$;

REVOKE ALL ON FUNCTION public.force_run_weekly_agency_transfers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_run_weekly_agency_transfers() TO authenticated, service_role;

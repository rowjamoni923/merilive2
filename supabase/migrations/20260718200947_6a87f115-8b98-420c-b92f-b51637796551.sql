
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
  _next_scheduled_utc timestamptz;
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

  -- Compute NEXT upcoming scheduled fire (always in the future)
  IF now() < _scheduled_utc THEN
    _next_scheduled_utc := _scheduled_utc;
  ELSE
    _next_scheduled_utc := (_scheduled_local + interval '7 days') AT TIME ZONE _tz;
  END IF;

  -- Keep next_transfer_at in sync so admin panel countdown is always accurate
  IF _is_active THEN
    UPDATE public.app_settings
       SET setting_value = ((_cfg || jsonb_build_object('next_transfer_at', to_jsonb(_next_scheduled_utc)))::text)::text,
           updated_at = now()
     WHERE setting_key = 'transfer_schedule'
       AND COALESCE(_cfg->>'next_transfer_at','') IS DISTINCT FROM to_jsonb(_next_scheduled_utc)::text;
  END IF;

  IF NOT _is_active THEN RETURN jsonb_build_object('skipped','inactive'); END IF;
  IF now() < _scheduled_utc THEN RETURN jsonb_build_object('skipped','not_due_time','scheduled_at',_scheduled_utc,'next_transfer_at',_next_scheduled_utc); END IF;
  IF _last_at IS NOT NULL AND _last_at >= _scheduled_utc THEN
    RETURN jsonb_build_object('skipped','already_fired','last_at',_last_at,'scheduled_at',_scheduled_utc);
  END IF;
  IF _last_at IS NOT NULL AND _last_at > now() - interval '6 days' THEN
    RETURN jsonb_build_object('skipped','too_recent','last_at',_last_at);
  END IF;

  PERFORM set_config('app.weekly_transfer_scheduler', 'true', true);
  _result := public.process_weekly_agency_transfers();
  PERFORM set_config('app.weekly_transfer_scheduler', 'false', true);

  SELECT setting_value::text INTO _comm_raw FROM public.app_settings WHERE setting_key = 'commission_schedule';
  BEGIN _comm := COALESCE(_comm_raw::jsonb, '{}'::jsonb); EXCEPTION WHEN OTHERS THEN _comm := '{}'::jsonb; END;
  _delay := COALESCE((_comm->>'delay_hours_after_transfer')::int, 1);
  IF _delay < 1 THEN _delay := 1; END IF;

  _out := jsonb_build_object('fired',true,'scheduled_at',_scheduled_utc,'next_transfer_at',(_scheduled_local + interval '7 days') AT TIME ZONE _tz,'result',_result,'commission_in_hours',_delay);

  -- Update after fire: refresh next_transfer_at to a week from the fired slot
  UPDATE public.app_settings
     SET setting_value = ((_cfg
           || jsonb_build_object('last_transfer_at', to_jsonb(now()))
           || jsonb_build_object('last_scheduled_at', to_jsonb(_scheduled_utc))
           || jsonb_build_object('next_transfer_at', to_jsonb((_scheduled_local + interval '7 days') AT TIME ZONE _tz))
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

REVOKE ALL ON FUNCTION public.tick_agency_weekly_scheduler() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tick_agency_weekly_scheduler() TO service_role;

-- Backfill next_transfer_at now so the panel countdown works immediately.
SELECT public.tick_agency_weekly_scheduler();

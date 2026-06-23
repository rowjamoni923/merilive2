-- Persist last tick result for diagnosis (writes back into transfer_schedule.last_tick_result)
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
  IF _raw IS NULL THEN
    _out := jsonb_build_object('skipped','no_schedule','ticked_at',to_jsonb(now()));
    RETURN _out;
  END IF;

  BEGIN _cfg := _raw::jsonb;
  EXCEPTION WHEN OTHERS THEN
    _out := jsonb_build_object('skipped','bad_json','ticked_at',to_jsonb(now()));
    RETURN _out;
  END;

  _is_active := COALESCE((_cfg->>'is_active')::boolean, false);
  _tz     := COALESCE(NULLIF(_cfg->>'timezone',''), 'UTC');
  _dow    := COALESCE((_cfg->>'schedule_day_of_week')::int, 1);
  _hour   := COALESCE((_cfg->>'schedule_hour')::int, 0);
  _minute := COALESCE((_cfg->>'schedule_minute')::int, 0);
  _last_at := NULLIF(_cfg->>'last_transfer_at','')::timestamptz;

  IF NOT _is_active THEN
    _out := jsonb_build_object('skipped','inactive','ticked_at',to_jsonb(now()));
    UPDATE public.app_settings SET setting_value = ((_cfg || jsonb_build_object('last_tick_result',_out))::text)::text WHERE setting_key='transfer_schedule';
    RETURN _out;
  END IF;

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

  IF now() < _scheduled_utc THEN
    _out := jsonb_build_object('skipped','not_due_time','scheduled_at',_scheduled_utc,'now',now(),'ticked_at',to_jsonb(now()));
    UPDATE public.app_settings SET setting_value = ((_cfg || jsonb_build_object('last_tick_result',_out))::text)::text WHERE setting_key='transfer_schedule';
    RETURN _out;
  END IF;

  IF _last_at IS NOT NULL AND _last_at >= _scheduled_utc THEN
    _out := jsonb_build_object('skipped','already_fired','last_at',_last_at,'scheduled_at',_scheduled_utc,'ticked_at',to_jsonb(now()));
    UPDATE public.app_settings SET setting_value = ((_cfg || jsonb_build_object('last_tick_result',_out))::text)::text WHERE setting_key='transfer_schedule';
    RETURN _out;
  END IF;

  IF _last_at IS NOT NULL AND _last_at > now() - interval '6 days' THEN
    _out := jsonb_build_object('skipped','too_recent','last_at',_last_at,'ticked_at',to_jsonb(now()));
    UPDATE public.app_settings SET setting_value = ((_cfg || jsonb_build_object('last_tick_result',_out))::text)::text WHERE setting_key='transfer_schedule';
    RETURN _out;
  END IF;

  -- FIRE
  _result := public.process_weekly_agency_transfers();

  SELECT setting_value::text INTO _comm_raw FROM public.app_settings WHERE setting_key = 'commission_schedule';
  BEGIN _comm := COALESCE(_comm_raw::jsonb, '{}'::jsonb); EXCEPTION WHEN OTHERS THEN _comm := '{}'::jsonb; END;
  _delay := COALESCE((_comm->>'delay_hours_after_transfer')::int, 1);
  IF _delay < 1 THEN _delay := 1; END IF;

  _out := jsonb_build_object('fired',true,'scheduled_at',_scheduled_utc,'result',_result,'commission_in_hours',_delay,'ticked_at',to_jsonb(now()));

  UPDATE public.app_settings
     SET setting_value = ((_cfg
           || jsonb_build_object('last_transfer_at', to_jsonb(now()))
           || jsonb_build_object('last_scheduled_at', to_jsonb(_scheduled_utc))
           || jsonb_build_object('last_result', _result)
           || jsonb_build_object('last_tick_result', _out))::text)::text,
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
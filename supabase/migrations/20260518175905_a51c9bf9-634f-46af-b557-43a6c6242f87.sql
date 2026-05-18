
-- 1) Remove hardcoded defaults; everything 100% admin-driven via new_host_live_bonus_settings.
--    If no active settings exist → host is simply not eligible (no silent fallback).

CREATE OR REPLACE FUNCTION public.get_task_program_day(_host_id uuid)
 RETURNS integer
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _verified_at TIMESTAMPTZ;
  _reset_offset INT;
  _eligible_days INT;
  _now_bst TIMESTAMPTZ := NOW() AT TIME ZONE 'Asia/Dhaka';
  _today_anchor DATE;
  _verified_anchor DATE;
  _diff INT;
BEGIN
  SELECT face_verified_at INTO _verified_at
  FROM profiles
  WHERE id = _host_id AND is_face_verified = true AND is_host = true AND host_status = 'approved';
  IF _verified_at IS NULL THEN RETURN 0; END IF;

  -- 100% admin-driven; if missing → not eligible
  SELECT MAX(daily_reset_offset_minutes), MAX(eligible_program_days)
  INTO _reset_offset, _eligible_days
  FROM new_host_live_bonus_settings WHERE is_active = true;

  IF _reset_offset IS NULL OR _eligible_days IS NULL OR _eligible_days <= 0 THEN
    RETURN 0;
  END IF;

  _today_anchor    := (date_trunc('day', _now_bst - (_reset_offset || ' minutes')::interval))::date;
  _verified_anchor := (date_trunc('day', (_verified_at AT TIME ZONE 'Asia/Dhaka') - (_reset_offset || ' minutes')::interval))::date;

  _diff := (_today_anchor - _verified_anchor) + 1;
  IF _diff < 1 OR _diff > _eligible_days THEN RETURN 0; END IF;
  RETURN _diff;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_host_live_bonus_state(_host_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _profile RECORD;
  _program_day INT;
  _eligible_days INT;
  _hours JSONB;
  _total_beans INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'unauthorized');
  END IF;

  SELECT is_host, host_status, is_face_verified, face_verified_at
  INTO _profile FROM profiles WHERE id = _host_id;

  IF NOT FOUND OR COALESCE(_profile.is_host,false)=false
     OR _profile.host_status <> 'approved'
     OR COALESCE(_profile.is_face_verified,false)=false THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_verified_host');
  END IF;

  SELECT MAX(eligible_program_days) INTO _eligible_days
  FROM new_host_live_bonus_settings WHERE is_active = true;

  IF _eligible_days IS NULL OR _eligible_days <= 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_configured');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'program_window_closed', 'program_days', _eligible_days);
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'hour_number', s.hour_number,
    'bonus_beans', s.bonus_beans,
    'minutes_accumulated', COALESCE(p.minutes_accumulated, 0),
    'completed', COALESCE(p.minutes_accumulated, 0) >= COALESCE(s.target_minutes, 60),
    'claimed',   COALESCE(p.bonus_claimed, false)
  ) ORDER BY s.hour_number) INTO _hours
  FROM new_host_live_bonus_settings s
  LEFT JOIN new_host_live_bonus_progress p
    ON p.hour_number = s.hour_number AND p.host_id = _host_id AND p.program_day = _program_day
  WHERE s.is_active = true;

  SELECT COALESCE(SUM(bonus_beans),0) INTO _total_beans
  FROM new_host_live_bonus_settings WHERE is_active = true;

  RETURN jsonb_build_object(
    'eligible', true,
    'program_day', _program_day,
    'program_days', _eligible_days,
    'hours', COALESCE(_hours, '[]'::jsonb),
    'daily_total_beans', _total_beans
  );
END;
$function$;

-- 2) Honor admin-configured target_minutes for "hour complete" (was hardcoded 60).
CREATE OR REPLACE FUNCTION public.record_host_live_minute(_host_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _program_day int;
  _today date := (timezone('Asia/Dhaka', now()))::date;
  _current_hour int;
  _bonus int;
  _target int;
  _live_ok boolean;
  _max_hours int;
  _filled_hours int;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM live_streams ls
    WHERE ls.host_id = _host_id
      AND COALESCE(ls.is_active, false) = true
      AND ls.ended_at IS NULL
      AND ls.last_heartbeat IS NOT NULL
      AND ls.last_heartbeat > (now() - interval '3 minutes')
  ) INTO _live_ok;

  IF NOT COALESCE(_live_ok, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_live');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  SELECT COUNT(*) INTO _max_hours
  FROM new_host_live_bonus_settings
  WHERE is_active = true AND hour_number IS NOT NULL;

  IF _max_hours IS NULL OR _max_hours = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_configured');
  END IF;

  -- a "filled" hour uses that hour's own target
  SELECT COUNT(*) INTO _filled_hours
  FROM new_host_live_bonus_progress p
  JOIN new_host_live_bonus_settings s
    ON s.hour_number = p.hour_number AND s.is_active = true
  WHERE p.host_id = _host_id AND p.program_day = _program_day
    AND p.minutes_accumulated >= COALESCE(s.target_minutes, 60);

  IF _filled_hours >= _max_hours THEN
    RETURN jsonb_build_object('success', true, 'capped', true, 'message', 'daily_cap_reached');
  END IF;

  -- next not-yet-filled hour
  SELECT s.hour_number, COALESCE(s.target_minutes, 60), s.bonus_beans
  INTO _current_hour, _target, _bonus
  FROM new_host_live_bonus_settings s
  LEFT JOIN new_host_live_bonus_progress p
    ON p.hour_number = s.hour_number
   AND p.host_id = _host_id
   AND p.program_day = _program_day
  WHERE s.is_active = true
    AND COALESCE(p.minutes_accumulated, 0) < COALESCE(s.target_minutes, 60)
  ORDER BY s.hour_number ASC
  LIMIT 1;

  IF _current_hour IS NULL THEN
    RETURN jsonb_build_object('success', true, 'capped', true, 'message', 'daily_cap_reached');
  END IF;

  IF _bonus IS NULL OR _bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bonus_not_configured');
  END IF;

  INSERT INTO new_host_live_bonus_progress
    (host_id, program_day, hour_number, day_number, target_minutes,
     minutes_accumulated, actual_minutes, bonus_amount, task_date)
  VALUES
    (_host_id, _program_day, _current_hour, _program_day, _target, 1, 1, _bonus, _today)
  ON CONFLICT (host_id, program_day, hour_number)
  DO UPDATE SET
    minutes_accumulated = LEAST(new_host_live_bonus_progress.minutes_accumulated + 1, EXCLUDED.target_minutes),
    actual_minutes      = LEAST(new_host_live_bonus_progress.actual_minutes + 1, EXCLUDED.target_minutes),
    target_minutes      = EXCLUDED.target_minutes,
    bonus_amount        = EXCLUDED.bonus_amount;

  RETURN jsonb_build_object(
    'success', true,
    'program_day', _program_day,
    'hour_number', _current_hour
  );
END;
$function$;

-- Match claim function to admin-configured target_minutes
CREATE OR REPLACE FUNCTION public.claim_host_live_hour_bonus(_host_id uuid, _hour_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _program_day INT;
  _row RECORD;
  _bonus INT;
  _target INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  SELECT bonus_beans, COALESCE(target_minutes,60)
  INTO _bonus, _target
  FROM public.new_host_live_bonus_settings
  WHERE hour_number = _hour_number AND is_active = true
  LIMIT 1;

  IF _bonus IS NULL OR _bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bonus_not_configured');
  END IF;

  SELECT * INTO _row FROM public.new_host_live_bonus_progress
  WHERE host_id = _host_id AND program_day = _program_day AND hour_number = _hour_number
  FOR UPDATE;

  IF NOT FOUND OR _row.minutes_accumulated < _target THEN
    RETURN jsonb_build_object('success', false, 'error', 'hour_incomplete');
  END IF;
  IF _row.bonus_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET beans = COALESCE(beans, 0) + _bonus WHERE id = _host_id;
  UPDATE public.new_host_live_bonus_progress
  SET bonus_claimed = true, claimed_at = NOW(), claimed_beans = _bonus,
      is_completed = true, completed_at = NOW()
  WHERE id = _row.id;
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (_host_id, 'bonus', '🎉 Live Hour Bonus!',
          'You earned ' || _bonus || ' Beans for completing hour ' || _hour_number,
          jsonb_build_object('beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day));
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object('success', true, 'beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day);
END;
$function$;

-- 3) Single admin RPC that fully maintains hour rows from admin panel.
--    Admin sets: beans_per_hour, max_hours_per_day, eligible_days, target_minutes, daily_reset_offset_minutes, is_active.
--    Function will sync rows to exactly max_hours_per_day, all carrying the same admin values.
CREATE OR REPLACE FUNCTION public.admin_save_host_bonus_settings(
  _beans_per_hour int,
  _max_hours_per_day int,
  _eligible_days int,
  _target_minutes int,
  _daily_reset_offset_minutes int,
  _is_active boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  IF _beans_per_hour IS NULL OR _beans_per_hour < 0
     OR _max_hours_per_day IS NULL OR _max_hours_per_day < 1
     OR _eligible_days IS NULL OR _eligible_days < 1
     OR _target_minutes IS NULL OR _target_minutes < 1
     OR _daily_reset_offset_minutes IS NULL OR _daily_reset_offset_minutes < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  -- Upsert exactly _max_hours_per_day rows
  INSERT INTO public.new_host_live_bonus_settings
    (hour_number, day_number, bonus_beans, bonus_amount, beans_per_hour,
     max_hours_per_day, eligible_days, eligible_program_days,
     target_minutes, daily_reset_offset_minutes, is_active)
  SELECT g, 1, _beans_per_hour, _beans_per_hour, _beans_per_hour,
         _max_hours_per_day, _eligible_days, _eligible_days,
         _target_minutes, _daily_reset_offset_minutes, _is_active
  FROM generate_series(1, _max_hours_per_day) g
  ON CONFLICT (hour_number) DO UPDATE SET
    bonus_beans = EXCLUDED.bonus_beans,
    bonus_amount = EXCLUDED.bonus_amount,
    beans_per_hour = EXCLUDED.beans_per_hour,
    max_hours_per_day = EXCLUDED.max_hours_per_day,
    eligible_days = EXCLUDED.eligible_days,
    eligible_program_days = EXCLUDED.eligible_program_days,
    target_minutes = EXCLUDED.target_minutes,
    daily_reset_offset_minutes = EXCLUDED.daily_reset_offset_minutes,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  -- Remove any extra rows beyond max_hours_per_day
  DELETE FROM public.new_host_live_bonus_settings
  WHERE hour_number > _max_hours_per_day OR hour_number < 1;

  RETURN jsonb_build_object('success', true, 'hours', _max_hours_per_day);
END;
$function$;

-- Make sure hour_number is unique so ON CONFLICT works
CREATE UNIQUE INDEX IF NOT EXISTS new_host_live_bonus_settings_hour_uidx
  ON public.new_host_live_bonus_settings(hour_number);

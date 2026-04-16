
ALTER TABLE public.new_host_live_bonus_settings
  ADD COLUMN IF NOT EXISTS hour_number INTEGER,
  ADD COLUMN IF NOT EXISTS bonus_beans INTEGER,
  ADD COLUMN IF NOT EXISTS eligible_program_days INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS daily_reset_offset_minutes INTEGER NOT NULL DEFAULT 1830;

DELETE FROM public.new_host_live_bonus_settings;

INSERT INTO public.new_host_live_bonus_settings
  (hour_number, bonus_beans, target_minutes, bonus_amount, day_number, is_active, eligible_program_days, daily_reset_offset_minutes)
VALUES
  (1, 10000, 60, 10000, 1, true, 3, 1830),
  (2, 10000, 60, 10000, 1, true, 3, 1830),
  (3, 10000, 60, 10000, 1, true, 3, 1830),
  (4, 10000, 60, 10000, 1, true, 3, 1830),
  (5, 10000, 60, 10000, 1, true, 3, 1830);

CREATE UNIQUE INDEX IF NOT EXISTS new_host_live_bonus_settings_hour_unique
  ON public.new_host_live_bonus_settings(hour_number)
  WHERE hour_number IS NOT NULL;

ALTER TABLE public.new_host_live_bonus_progress
  ADD COLUMN IF NOT EXISTS program_day INTEGER,
  ADD COLUMN IF NOT EXISTS hour_number INTEGER,
  ADD COLUMN IF NOT EXISTS minutes_accumulated INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_claimed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_beans INTEGER,
  ADD COLUMN IF NOT EXISTS task_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS new_host_live_bonus_progress_unique
  ON public.new_host_live_bonus_progress(host_id, program_day, hour_number)
  WHERE program_day IS NOT NULL AND hour_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS new_host_live_bonus_progress_host_idx
  ON public.new_host_live_bonus_progress(host_id, task_date);

ALTER TABLE public.new_host_live_bonus_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.new_host_live_bonus_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_bonus_settings_read_all" ON public.new_host_live_bonus_settings;
CREATE POLICY "live_bonus_settings_read_all"
  ON public.new_host_live_bonus_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "live_bonus_settings_admin_write" ON public.new_host_live_bonus_settings;
CREATE POLICY "live_bonus_settings_admin_write"
  ON public.new_host_live_bonus_settings FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "live_bonus_progress_read_own" ON public.new_host_live_bonus_progress;
CREATE POLICY "live_bonus_progress_read_own"
  ON public.new_host_live_bonus_progress FOR SELECT
  USING (auth.uid() = host_id OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_task_program_day(_host_id UUID)
RETURNS INTEGER LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  SELECT COALESCE(MAX(daily_reset_offset_minutes), 1830),
         COALESCE(MAX(eligible_program_days), 3)
  INTO _reset_offset, _eligible_days
  FROM new_host_live_bonus_settings WHERE is_active = true;

  _today_anchor    := (date_trunc('day', _now_bst - (_reset_offset || ' minutes')::interval))::date;
  _verified_anchor := (date_trunc('day', (_verified_at AT TIME ZONE 'Asia/Dhaka') - (_reset_offset || ' minutes')::interval))::date;

  _diff := (_today_anchor - _verified_anchor) + 1;
  IF _diff < 1 OR _diff > _eligible_days THEN RETURN 0; END IF;
  RETURN _diff;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_host_live_minute(_host_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _program_day INT;
  _today DATE := (NOW() AT TIME ZONE 'Asia/Dhaka')::date;
  _current_hour INT;
  _bonus INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  SELECT p.hour_number INTO _current_hour
  FROM new_host_live_bonus_progress p
  WHERE p.host_id = _host_id AND p.program_day = _program_day
    AND p.minutes_accumulated < 60
  ORDER BY p.hour_number ASC LIMIT 1;

  IF _current_hour IS NULL THEN
    SELECT MIN(s.hour_number) INTO _current_hour
    FROM new_host_live_bonus_settings s
    WHERE s.is_active = true
      AND s.hour_number NOT IN (
        SELECT hour_number FROM new_host_live_bonus_progress
        WHERE host_id = _host_id AND program_day = _program_day AND hour_number IS NOT NULL
      );
    IF _current_hour IS NULL THEN
      RETURN jsonb_build_object('success', true, 'capped', true, 'message', 'daily_cap_reached');
    END IF;
  END IF;

  SELECT bonus_beans INTO _bonus FROM new_host_live_bonus_settings
  WHERE hour_number = _current_hour AND is_active = true LIMIT 1;

  INSERT INTO new_host_live_bonus_progress
    (host_id, program_day, hour_number, day_number, target_minutes, minutes_accumulated, actual_minutes, bonus_amount, task_date)
  VALUES
    (_host_id, _program_day, _current_hour, _program_day, 60, 1, 1, COALESCE(_bonus, 10000), _today)
  ON CONFLICT (host_id, program_day, hour_number)
  DO UPDATE SET
    minutes_accumulated = LEAST(new_host_live_bonus_progress.minutes_accumulated + 1, 60),
    actual_minutes      = LEAST(new_host_live_bonus_progress.minutes_accumulated + 1, 60);

  RETURN jsonb_build_object('success', true, 'program_day', _program_day, 'hour_number', _current_hour);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_host_live_hour_bonus(_host_id UUID, _hour_number INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _program_day INT;
  _row RECORD;
  _bonus INT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _host_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_eligible');
  END IF;

  SELECT * INTO _row FROM new_host_live_bonus_progress
  WHERE host_id = _host_id AND program_day = _program_day AND hour_number = _hour_number
  FOR UPDATE;

  IF NOT FOUND OR _row.minutes_accumulated < 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'hour_incomplete');
  END IF;
  IF _row.bonus_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  SELECT bonus_beans INTO _bonus FROM new_host_live_bonus_settings
  WHERE hour_number = _hour_number AND is_active = true LIMIT 1;
  _bonus := COALESCE(_bonus, 10000);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET beans_balance = COALESCE(beans_balance, 0) + _bonus WHERE id = _host_id;
  UPDATE new_host_live_bonus_progress
  SET bonus_claimed = true, claimed_at = NOW(), claimed_beans = _bonus,
      is_completed = true, completed_at = NOW()
  WHERE id = _row.id;
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (_host_id, 'bonus', 'Live Bonus Claimed',
          'You earned ' || _bonus || ' Beans for completing hour ' || _hour_number,
          jsonb_build_object('beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day));
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object('success', true, 'beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_host_live_bonus_state(_host_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  SELECT COALESCE(MAX(eligible_program_days), 3) INTO _eligible_days
  FROM new_host_live_bonus_settings WHERE is_active = true;

  _program_day := public.get_task_program_day(_host_id);
  IF _program_day = 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'program_window_closed', 'program_days', _eligible_days);
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'hour_number', s.hour_number,
    'bonus_beans', s.bonus_beans,
    'minutes_accumulated', COALESCE(p.minutes_accumulated, 0),
    'completed', COALESCE(p.minutes_accumulated, 0) >= 60,
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
$$;

GRANT EXECUTE ON FUNCTION public.get_task_program_day(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_host_live_minute(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_host_live_hour_bonus(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_host_live_bonus_state(uuid) TO authenticated;

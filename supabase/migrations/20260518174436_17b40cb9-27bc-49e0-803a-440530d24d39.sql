
-- Fix new host hourly bonus to credit canonical 'beans' column (was wrongly writing beans_balance, invisible to UI)
CREATE OR REPLACE FUNCTION public.claim_host_live_hour_bonus(_host_id uuid, _hour_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT * INTO _row FROM public.new_host_live_bonus_progress
  WHERE host_id = _host_id AND program_day = _program_day AND hour_number = _hour_number
  FOR UPDATE;

  IF NOT FOUND OR _row.minutes_accumulated < 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'hour_incomplete');
  END IF;
  IF _row.bonus_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  SELECT bonus_beans INTO _bonus FROM public.new_host_live_bonus_settings
  WHERE hour_number = _hour_number AND is_active = true
  ORDER BY day_number ASC
  LIMIT 1;

  IF _bonus IS NULL OR _bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bonus_not_configured');
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

-- Re-seed admin-controlled hourly bonus to spec: $1/hour × 5 hours × 3 days = $15 total
-- (9,000 Beans = $1 USD; admin can edit later in /admin/tasks-settings)
UPDATE public.new_host_live_bonus_settings
SET bonus_beans = 9000,
    bonus_amount = 9000,
    beans_per_hour = 9000,
    max_hours_per_day = 5,
    eligible_days = 3,
    eligible_program_days = 3,
    target_minutes = 60,
    is_active = true,
    updated_at = now()
WHERE hour_number BETWEEN 1 AND 5;


-- Fix #5: Remove hardcoded 10000 beans fallback in claim_host_live_hour_bonus
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

  SELECT * INTO _row FROM new_host_live_bonus_progress
  WHERE host_id = _host_id AND program_day = _program_day AND hour_number = _hour_number
  FOR UPDATE;

  IF NOT FOUND OR _row.minutes_accumulated < 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'hour_incomplete');
  END IF;
  IF _row.bonus_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  -- Read admin-configured bonus (no hardcoded fallback)
  SELECT bonus_beans INTO _bonus FROM new_host_live_bonus_settings
  WHERE hour_number = _hour_number AND is_active = true 
  ORDER BY day_number ASC
  LIMIT 1;
  
  IF _bonus IS NULL OR _bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'bonus_not_configured');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET beans_balance = COALESCE(beans_balance, 0) + _bonus WHERE id = _host_id;
  UPDATE new_host_live_bonus_progress
  SET bonus_claimed = true, claimed_at = NOW(), claimed_beans = _bonus,
      is_completed = true, completed_at = NOW()
  WHERE id = _row.id;
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (_host_id, 'bonus', '🎉 Live Hour Bonus!',
          'You earned ' || _bonus || ' Beans for completing hour ' || _hour_number,
          jsonb_build_object('beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day));
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object('success', true, 'beans', _bonus, 'hour_number', _hour_number, 'program_day', _program_day);
END;
$function$;


-- Fix #4: claim_new_host_live_bonus to read from admin settings instead of hardcoded 500
CREATE OR REPLACE FUNCTION public.claim_new_host_live_bonus(_host_id uuid, _bonus_coins integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE 
  _profile RECORD; 
  _stream_count INT;
  _admin_bonus INT := 0;
  _final_bonus INT := 0;
BEGIN
  SELECT * INTO _profile FROM profiles WHERE id = _host_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF _profile.is_host != true THEN RETURN jsonb_build_object('success', false, 'error', 'Not a host'); END IF;
  IF _profile.new_host_bonus_claimed = true THEN RETURN jsonb_build_object('success', false, 'error', 'Bonus already claimed'); END IF;
  
  SELECT COUNT(*) INTO _stream_count FROM live_streams WHERE host_id = _host_id AND ended_at IS NOT NULL;
  IF _stream_count < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'Must complete at least 1 live stream'); END IF;
  
  -- Read admin-configured bonus amount (sum of all active hour-tiers for day 1, or fallback to total config)
  SELECT COALESCE(SUM(bonus_amount), 0)::INT INTO _admin_bonus
  FROM new_host_live_bonus_settings
  WHERE is_active = true AND day_number = 1;
  
  -- Priority: explicit caller param > admin settings > 0 (no hardcoded 500)
  _final_bonus := COALESCE(_bonus_coins, NULLIF(_admin_bonus, 0), 0);
  
  IF _final_bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bonus is not configured by admin');
  END IF;
  
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles 
  SET coins = COALESCE(coins, 0) + _final_bonus, 
      new_host_bonus_claimed = true 
  WHERE id = _host_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  
  INSERT INTO notifications (user_id, type, title, message, data) 
  VALUES (
    _host_id, 
    'bonus', 
    '🎉 New Host Bonus!', 
    'Congratulations! You received ' || _final_bonus || ' coins as your new host bonus.', 
    jsonb_build_object('bonus_coins', _final_bonus, 'type', 'new_host_bonus')
  );
  
  RETURN jsonb_build_object('success', true, 'bonus_coins', _final_bonus);
END;
$function$;


-- Step 1: Insert default admin settings if they don't exist
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES 
  ('welcome_bonus_coins', '50', 'Coins granted to new users on signup'),
  ('welcome_bonus_diamonds', '0', 'Diamonds granted to new users on signup')
ON CONFLICT (setting_key) DO NOTHING;

-- Step 2: Rewrite trigger to read from admin settings
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bonus_coins INTEGER := 0;
  _bonus_diamonds INTEGER := 0;
  _msg_parts TEXT[] := ARRAY[]::TEXT[];
  _final_msg TEXT;
BEGIN
  -- Skip if already granted
  IF EXISTS (SELECT 1 FROM public.welcome_bonuses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Read admin-configured values
  SELECT COALESCE(NULLIF(setting_value, '')::INTEGER, 0) INTO _bonus_coins
  FROM public.app_settings WHERE setting_key = 'welcome_bonus_coins';

  SELECT COALESCE(NULLIF(setting_value, '')::INTEGER, 0) INTO _bonus_diamonds
  FROM public.app_settings WHERE setting_key = 'welcome_bonus_diamonds';

  _bonus_coins := COALESCE(_bonus_coins, 0);
  _bonus_diamonds := COALESCE(_bonus_diamonds, 0);

  -- If admin disabled bonus (both zero), exit silently
  IF _bonus_coins = 0 AND _bonus_diamonds = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _bonus_coins > 0 THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + _bonus_coins WHERE id = NEW.id;
    _msg_parts := array_append(_msg_parts, _bonus_coins || ' coins');
  END IF;

  IF _bonus_diamonds > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _bonus_diamonds WHERE id = NEW.id;
    _msg_parts := array_append(_msg_parts, _bonus_diamonds || ' diamonds');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  INSERT INTO public.welcome_bonuses (user_id, bonus_type, bonus_amount, claimed, claimed_at)
  VALUES (NEW.id, 'welcome_bonus', _bonus_coins + _bonus_diamonds, true, now());

  _final_msg := 'Welcome! You have received ' || array_to_string(_msg_parts, ' and ') || ' as a signup bonus.';

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.id,
    'welcome_bonus',
    '🎁 Welcome Bonus!',
    _final_msg,
    jsonb_build_object(
      'bonus_coins', _bonus_coins,
      'bonus_diamonds', _bonus_diamonds,
      'type', 'welcome_bonus'
    )
  );

  RETURN NEW;
END;
$function$;

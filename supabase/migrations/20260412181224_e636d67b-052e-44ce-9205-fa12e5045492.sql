-- Fix: grant_welcome_bonus must bypass profile protection triggers
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bonus_amount INTEGER := 50;
BEGIN
  -- Skip if already received
  IF EXISTS (SELECT 1 FROM public.welcome_bonuses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Set bypass flag so protect_sensitive_profile_columns and prevent_balance_manipulation allow the update
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles SET coins = COALESCE(coins, 0) + bonus_amount WHERE id = NEW.id;

  INSERT INTO public.welcome_bonuses (user_id, bonus_coins)
  VALUES (NEW.id, bonus_amount) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (NEW.id, 'welcome_bonus', '🎁 Welcome Bonus!', 'Welcome! You have received 50 bonus coins.',
    jsonb_build_object('bonus_coins', bonus_amount, 'type', 'welcome_bonus'));

  RETURN NEW;
END;
$$;
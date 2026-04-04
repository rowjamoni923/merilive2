
-- Fix welcome bonus notification to English
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS TRIGGER AS $$
DECLARE
  bonus_amount INTEGER := 50;
BEGIN
  IF EXISTS (SELECT 1 FROM public.welcome_bonuses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + bonus_amount
  WHERE id = NEW.id;

  INSERT INTO public.welcome_bonuses (user_id, bonus_coins)
  VALUES (NEW.id, bonus_amount)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.id,
    'welcome_bonus',
    '🎁 Welcome Bonus!',
    'Welcome to meriLIVE! You have received 50 bonus coins. Explore and enjoy!',
    jsonb_build_object('bonus_coins', bonus_amount, 'type', 'welcome_bonus')
  );

  RAISE LOG '[WelcomeBonus] Granted % coins to user %', bonus_amount, NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

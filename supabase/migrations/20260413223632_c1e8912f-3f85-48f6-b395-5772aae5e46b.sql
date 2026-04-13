CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bonus_amount INTEGER := 50;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.welcome_bonuses
    WHERE user_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + bonus_amount
  WHERE id = NEW.id;

  INSERT INTO public.welcome_bonuses (
    user_id,
    bonus_type,
    bonus_amount,
    claimed,
    claimed_at
  )
  VALUES (
    NEW.id,
    'welcome_bonus',
    bonus_amount,
    true,
    now()
  );

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.id,
    'welcome_bonus',
    '🎁 Welcome Bonus!',
    'Welcome! You have received 50 bonus coins.',
    jsonb_build_object('bonus_coins', bonus_amount, 'type', 'welcome_bonus')
  );

  RETURN NEW;
END;
$$;
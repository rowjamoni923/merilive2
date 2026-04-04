
-- =============================================
-- NEW USER WELCOME BONUS SYSTEM
-- Auto-grants 50 coins when a profile is first created
-- =============================================

-- 1. Track welcome bonuses to prevent duplicates
CREATE TABLE IF NOT EXISTS public.welcome_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bonus_coins INTEGER NOT NULL DEFAULT 50,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.welcome_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own welcome bonus"
  ON public.welcome_bonuses
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. Function to grant welcome bonus on profile creation
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS TRIGGER AS $$
DECLARE
  bonus_amount INTEGER := 50;
BEGIN
  -- Only for new inserts (not updates)
  -- Check if bonus already given
  IF EXISTS (SELECT 1 FROM public.welcome_bonuses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Grant coins
  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + bonus_amount
  WHERE id = NEW.id;

  -- Record the bonus
  INSERT INTO public.welcome_bonuses (user_id, bonus_coins)
  VALUES (NEW.id, bonus_amount)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create notification for welcome bonus
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.id,
    'welcome_bonus',
    '🎁 ওয়েলকাম বোনাস!',
    'meriLIVE-তে স্বাগতম! তোমাকে 50 কয়েন বোনাস দেওয়া হয়েছে। এক্সপ্লোর করো আর মজা করো!',
    jsonb_build_object('bonus_coins', bonus_amount, 'type', 'welcome_bonus')
  );

  RAISE LOG '[WelcomeBonus] Granted % coins to user %', bonus_amount, NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger on profile creation
DROP TRIGGER IF EXISTS trigger_welcome_bonus ON public.profiles;
CREATE TRIGGER trigger_welcome_bonus
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_welcome_bonus();

-- =============================================
-- RE-ENGAGEMENT NOTIFICATION TYPE SUPPORT
-- Allow 'reengagement' and 'welcome_bonus' notification types
-- =============================================
-- (notifications table already exists, just ensuring the types work)

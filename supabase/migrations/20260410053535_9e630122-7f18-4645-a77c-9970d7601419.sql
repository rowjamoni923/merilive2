
-- 1. Auto-create profile on signup trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    display_name,
    gender,
    device_id,
    coins,
    total_earnings,
    pending_earnings,
    is_host,
    is_verified,
    level,
    consumption_coins,
    created_at
  ) VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1),
      'User'
    ),
    COALESCE(NEW.raw_user_meta_data->>'gender', 'male'),
    NEW.raw_user_meta_data->>'device_id',
    0, 0, 0, false, false, 1, 0, NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Game transactions table (if not exists)
CREATE TABLE IF NOT EXISTS public.game_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  game_type TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('bet', 'win', 'refund')),
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.game_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own game transactions
DO $$ BEGIN
  CREATE POLICY "Users can view own game transactions"
    ON public.game_transactions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. place_game_bet RPC - atomic diamond deduction for bets
CREATE OR REPLACE FUNCTION public.place_game_bet(
  p_user_id UUID,
  p_amount BIGINT,
  p_game_type TEXT DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
BEGIN
  -- Lock the row to prevent race conditions
  SELECT coins INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_current_balance);
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- Bypass protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET coins = v_new_balance WHERE id = p_user_id;

  -- Log transaction
  INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_type, 'bet', p_amount, v_current_balance, v_new_balance);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'deducted', p_amount);
END;
$$;

-- 4. process_game_win RPC - atomic diamond addition for wins
CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id UUID,
  p_amount BIGINT,
  p_game_type TEXT DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
BEGIN
  SELECT coins INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new_balance := v_current_balance + p_amount;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET coins = v_new_balance WHERE id = p_user_id;

  INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_type, 'win', p_amount, v_current_balance, v_new_balance);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'added', p_amount);
END;
$$;

-- 5. deduct_coins_atomic RPC - simple atomic deduction (for Roulette etc.)
CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(
  p_user_id UUID,
  p_amount BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current BIGINT;
  v_new BIGINT;
BEGIN
  SELECT coins INTO v_current
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_current);
  END IF;

  v_new := v_current - p_amount;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = v_new WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new);
END;
$$;

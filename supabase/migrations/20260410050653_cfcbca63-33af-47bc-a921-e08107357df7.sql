
-- 1. place_game_bet: Atomically deduct diamonds for a game bet
CREATE OR REPLACE FUNCTION public.place_game_bet(
  p_user_id UUID,
  p_amount INTEGER,
  p_game_id TEXT,
  p_game_name TEXT
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
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;

  -- Lock the row and get current balance
  SELECT coins INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- Update balance
  UPDATE profiles SET coins = v_new_balance WHERE id = p_user_id;

  -- Log transaction
  INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_name, 'bet', p_amount, v_current_balance, v_new_balance);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- 2. process_game_win: Atomically add diamonds for a game win
CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id UUID,
  p_amount INTEGER,
  p_game_id TEXT,
  p_game_name TEXT,
  p_multiplier NUMERIC DEFAULT NULL,
  p_is_jackpot BOOLEAN DEFAULT FALSE
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
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount');
  END IF;

  -- Lock the row and get current balance
  SELECT coins INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- Update balance
  UPDATE profiles SET coins = v_new_balance WHERE id = p_user_id;

  -- Log transaction
  INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_name, 'win', p_amount, v_current_balance, v_new_balance);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- 3. deduct_coins_atomic: Simple atomic deduction for roulette
CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(
  p_user_id UUID,
  p_amount INTEGER
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
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT coins INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;

  v_new_balance := v_current_balance - p_amount;

  UPDATE profiles SET coins = v_new_balance WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;


-- =============================================
-- ATOMIC GAME BET & WIN FUNCTIONS
-- Prevents race conditions in game diamond deduction
-- =============================================

-- Atomic bet placement with FOR UPDATE row locking
CREATE OR REPLACE FUNCTION public.place_game_bet(
  p_user_id UUID,
  p_amount INTEGER,
  p_game_id TEXT,
  p_game_name TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the user row to prevent race conditions
  SELECT coins INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_current_balance);
  END IF;
  
  v_new_balance := v_current_balance - p_amount;
  
  -- Atomic deduction
  UPDATE profiles
  SET coins = v_new_balance, updated_at = now()
  WHERE id = p_user_id;
  
  -- Log transaction
  INSERT INTO game_transactions (user_id, game_id, game_name, transaction_type, amount, balance_before, balance_after, details)
  VALUES (p_user_id, p_game_id, p_game_name, 'bet', p_amount, v_current_balance, v_new_balance, '{"action": "bet_placed"}'::jsonb);
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'deducted', p_amount);
END;
$$;

-- Atomic win processing with FOR UPDATE row locking
CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id UUID,
  p_amount INTEGER,
  p_game_id TEXT,
  p_game_name TEXT,
  p_multiplier NUMERIC DEFAULT NULL,
  p_is_jackpot BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the user row
  SELECT coins INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  v_new_balance := v_current_balance + p_amount;
  
  -- Atomic addition
  UPDATE profiles
  SET coins = v_new_balance, updated_at = now()
  WHERE id = p_user_id;
  
  -- Log transaction
  INSERT INTO game_transactions (user_id, game_id, game_name, transaction_type, amount, balance_before, balance_after, multiplier, details)
  VALUES (p_user_id, p_game_id, p_game_name,
    CASE WHEN p_is_jackpot THEN 'jackpot' ELSE 'win' END,
    p_amount, v_current_balance, v_new_balance, p_multiplier,
    jsonb_build_object('action', CASE WHEN p_is_jackpot THEN 'jackpot_won' ELSE 'game_won' END));
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'won', p_amount);
END;
$$;

-- =============================================
-- ATOMIC TRADER OPERATIONS
-- Prevents race conditions in coin trading
-- =============================================

-- Atomic coin deduction from user (for trader buy operations)
CREATE OR REPLACE FUNCTION public.deduct_coins_from_user(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
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
  
  UPDATE profiles
  SET coins = v_new_balance, updated_at = now()
  WHERE id = p_user_id;
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- Atomic agency wallet deduction (for trader sell operations)
CREATE OR REPLACE FUNCTION public.deduct_agency_wallet(
  p_agency_id UUID,
  p_amount INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_balance INTEGER;
  v_helper_balance INTEGER;
  v_helper_id UUID;
  v_owner_id UUID;
  v_deducted_agency INTEGER;
  v_deducted_helper INTEGER;
  v_remaining INTEGER;
BEGIN
  -- Get agency balance with lock
  SELECT wallet_balance, owner_id INTO v_agency_balance, v_owner_id
  FROM agencies
  WHERE id = p_agency_id
  FOR UPDATE;
  
  IF v_agency_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  
  -- Get helper wallet balance if the owner is also a helper
  SELECT id, wallet_balance INTO v_helper_id, v_helper_balance
  FROM topup_helpers
  WHERE user_id = v_owner_id
  FOR UPDATE;
  
  v_helper_balance := COALESCE(v_helper_balance, 0);
  v_agency_balance := COALESCE(v_agency_balance, 0);
  
  -- Total available = agency + helper wallet
  IF (v_agency_balance + v_helper_balance) < p_amount THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient balance',
      'agency_balance', v_agency_balance,
      'helper_balance', v_helper_balance,
      'total', v_agency_balance + v_helper_balance
    );
  END IF;
  
  -- Deduct from agency first, then helper wallet if needed
  v_remaining := p_amount;
  v_deducted_agency := 0;
  v_deducted_helper := 0;
  
  IF v_agency_balance >= v_remaining THEN
    -- Agency has enough
    v_deducted_agency := v_remaining;
    v_remaining := 0;
  ELSE
    -- Use all agency balance, remainder from helper
    v_deducted_agency := v_agency_balance;
    v_remaining := v_remaining - v_agency_balance;
  END IF;
  
  IF v_remaining > 0 AND v_helper_id IS NOT NULL THEN
    v_deducted_helper := v_remaining;
    v_remaining := 0;
  END IF;
  
  -- Should never happen after the check above, but safety
  IF v_remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance calculation error');
  END IF;
  
  -- Apply deductions atomically
  IF v_deducted_agency > 0 THEN
    UPDATE agencies
    SET wallet_balance = wallet_balance - v_deducted_agency, updated_at = now()
    WHERE id = p_agency_id;
  END IF;
  
  IF v_deducted_helper > 0 AND v_helper_id IS NOT NULL THEN
    UPDATE topup_helpers
    SET wallet_balance = wallet_balance - v_deducted_helper
    WHERE id = v_helper_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'deducted_agency', v_deducted_agency,
    'deducted_helper', v_deducted_helper,
    'new_agency_balance', v_agency_balance - v_deducted_agency,
    'new_helper_balance', v_helper_balance - v_deducted_helper
  );
END;
$$;

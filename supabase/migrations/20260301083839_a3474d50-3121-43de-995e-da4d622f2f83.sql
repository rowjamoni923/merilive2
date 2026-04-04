
-- Atomic RPC: Transfer diamonds from helper's trader wallet to their own profile coins (My Diamond Balance)
-- This allows helpers/traders to self-recharge their diamond balance from their trader wallet
CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(
  _user_id UUID,
  _amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_record RECORD;
  _current_coins INTEGER;
  _new_wallet_balance INTEGER;
  _new_coins INTEGER;
BEGIN
  -- Validate amount
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be greater than 0');
  END IF;

  -- Lock and fetch helper record
  SELECT id, user_id, wallet_balance, is_active
  INTO _helper_record
  FROM topup_helpers
  WHERE user_id = _user_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active trader/helper account found');
  END IF;

  -- Check sufficient balance in trader wallet
  IF _helper_record.wallet_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient trader wallet balance. Available: ' || _helper_record.wallet_balance);
  END IF;

  -- Lock and fetch user profile
  SELECT coins INTO _current_coins
  FROM profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User profile not found');
  END IF;

  -- Calculate new balances
  _new_wallet_balance := _helper_record.wallet_balance - _amount;
  _new_coins := _current_coins + _amount;

  -- Deduct from trader wallet
  UPDATE topup_helpers
  SET wallet_balance = _new_wallet_balance, updated_at = NOW()
  WHERE id = _helper_record.id;

  -- Add to profile coins (My Diamond Balance)
  UPDATE profiles
  SET coins = _new_coins
  WHERE id = _user_id;

  -- Log the transfer in coin_transfers
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, sender_type, status, note)
  VALUES (_user_id, _user_id, _amount, 'trader_self_recharge', 'completed', 'Self recharge from Trader Wallet to My Diamond Balance');

  RETURN json_build_object(
    'success', true,
    'amount', _amount,
    'new_wallet_balance', _new_wallet_balance,
    'new_coins', _new_coins,
    'previous_wallet_balance', _helper_record.wallet_balance,
    'previous_coins', _current_coins
  );
END;
$$;

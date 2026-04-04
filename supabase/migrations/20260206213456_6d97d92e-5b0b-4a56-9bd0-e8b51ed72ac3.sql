-- Atomic function to deduct from helper wallet (prevents negative balance & race conditions)
CREATE OR REPLACE FUNCTION public.deduct_helper_wallet(
  _helper_id UUID,
  _amount NUMERIC,
  _update_total_sold BOOLEAN DEFAULT true
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance NUMERIC;
  _new_balance NUMERIC;
BEGIN
  IF _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Lock the row and get current balance (FOR UPDATE prevents race conditions)
  SELECT wallet_balance INTO _current_balance
  FROM topup_helpers
  WHERE id = _helper_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Helper not found');
  END IF;

  _current_balance := COALESCE(_current_balance, 0);

  -- Prevent negative balance
  IF _current_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', _current_balance);
  END IF;

  _new_balance := _current_balance - _amount;

  -- Atomic deduction with optional total_sold update
  IF _update_total_sold THEN
    UPDATE topup_helpers 
    SET wallet_balance = _new_balance,
        total_sold = COALESCE(total_sold, 0) + _amount
    WHERE id = _helper_id;
  ELSE
    UPDATE topup_helpers 
    SET wallet_balance = _new_balance
    WHERE id = _helper_id;
  END IF;

  RETURN json_build_object('success', true, 'new_balance', _new_balance, 'deducted', _amount);
END;
$$;

-- Also create a function to add to helper wallet atomically
CREATE OR REPLACE FUNCTION public.add_to_helper_wallet(
  _helper_id UUID,
  _amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE topup_helpers 
  SET wallet_balance = COALESCE(wallet_balance, 0) + _amount
  WHERE id = _helper_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Helper not found';
  END IF;
END;
$$;
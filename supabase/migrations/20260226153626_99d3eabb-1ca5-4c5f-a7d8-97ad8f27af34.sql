
-- Fix deduct_helper_wallet: Allow the helper themselves (not just admins) to deduct from their own wallet
CREATE OR REPLACE FUNCTION public.deduct_helper_wallet(
  _helper_id uuid,
  _amount numeric,
  _update_total_sold boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance NUMERIC;
  _new_balance NUMERIC;
  _helper_user_id uuid;
  _caller uuid;
BEGIN
  _caller := auth.uid();
  
  -- Get helper's user_id to check ownership
  SELECT user_id, wallet_balance INTO _helper_user_id, _current_balance
  FROM topup_helpers
  WHERE id = _helper_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Helper not found');
  END IF;

  -- Allow if caller is the helper themselves OR is an admin
  IF _caller IS NULL OR (_caller != _helper_user_id AND NOT public.is_admin(_caller)) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  _current_balance := COALESCE(_current_balance, 0);

  IF _current_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', _current_balance);
  END IF;

  _new_balance := _current_balance - _amount;

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

-- Create a helper-safe function to add coins to user (for helper transfers only)
-- Different from admin add_coins_to_user: requires caller to be an active helper
CREATE OR REPLACE FUNCTION public.helper_add_coins_to_user(
  _user_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Verify caller is an active helper or admin
  IF NOT EXISTS (SELECT 1 FROM topup_helpers WHERE user_id = v_caller AND is_active = true)
     AND NOT public.is_admin(v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an active helper');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Create a helper-safe function to add diamonds to agency
CREATE OR REPLACE FUNCTION public.helper_add_diamonds_to_agency(
  _agency_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Verify caller is an active helper or admin
  IF NOT EXISTS (SELECT 1 FROM topup_helpers WHERE user_id = v_caller AND is_active = true)
     AND NOT public.is_admin(v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an active helper');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount
  WHERE id = _agency_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

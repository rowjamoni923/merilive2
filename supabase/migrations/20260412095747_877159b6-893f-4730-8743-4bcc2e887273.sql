
-- 1) Deduct from helper wallet atomically
CREATE OR REPLACE FUNCTION public.deduct_helper_wallet(_helper_id uuid, _amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bal numeric;
BEGIN
  SELECT wallet_balance INTO current_bal FROM topup_helpers WHERE id = _helper_id FOR UPDATE;
  IF current_bal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found');
  END IF;
  IF current_bal < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance', 'balance', current_bal);
  END IF;
  UPDATE topup_helpers SET wallet_balance = wallet_balance - _amount, updated_at = now() WHERE id = _helper_id;
  RETURN jsonb_build_object('success', true, 'new_balance', current_bal - _amount);
END;
$$;

-- 2) Add diamonds to agency
CREATE OR REPLACE FUNCTION public.helper_add_diamonds_to_agency(_agency_id uuid, _amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE agencies SET diamond_balance = diamond_balance + _amount, updated_at = now() WHERE id = _agency_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3) Get agency diamond balance by owner
CREATE OR REPLACE FUNCTION public.get_agency_diamond_balance(owner_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bal bigint;
BEGIN
  SELECT diamond_balance INTO bal FROM agencies WHERE owner_id = owner_user_id LIMIT 1;
  RETURN COALESCE(bal, 0);
END;
$$;

-- 4) Helper transfer coins to user (unified transfer function)
CREATE OR REPLACE FUNCTION public.helper_transfer_coins_to_user(
  _sender_id uuid,
  _receiver_id uuid,
  _amount bigint,
  _sender_type text DEFAULT 'trader_to_user'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  helper_rec record;
  agency_rec record;
  agency_deducted bigint := 0;
  helper_deducted bigint := 0;
  remaining bigint := _amount;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Check if sender is agency owner
  IF _sender_type = 'agency_to_user' THEN
    SELECT * INTO agency_rec FROM agencies WHERE owner_id = _sender_id FOR UPDATE;
    IF agency_rec IS NOT NULL AND agency_rec.diamond_balance >= remaining THEN
      UPDATE agencies SET diamond_balance = diamond_balance - remaining, updated_at = now() WHERE id = agency_rec.id;
      agency_deducted := remaining;
      remaining := 0;
    ELSIF agency_rec IS NOT NULL AND agency_rec.diamond_balance > 0 THEN
      agency_deducted := agency_rec.diamond_balance;
      remaining := remaining - agency_deducted;
      UPDATE agencies SET diamond_balance = 0, updated_at = now() WHERE id = agency_rec.id;
    END IF;
  END IF;

  -- If still remaining, deduct from helper wallet
  IF remaining > 0 THEN
    SELECT * INTO helper_rec FROM topup_helpers WHERE user_id = _sender_id FOR UPDATE;
    IF helper_rec IS NOT NULL AND helper_rec.wallet_balance >= remaining THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance - remaining, updated_at = now() WHERE id = helper_rec.id;
      helper_deducted := remaining;
      remaining := 0;
    ELSIF helper_rec IS NOT NULL AND helper_rec.wallet_balance > 0 THEN
      helper_deducted := helper_rec.wallet_balance::bigint;
      remaining := remaining - helper_deducted;
      UPDATE topup_helpers SET wallet_balance = 0, updated_at = now() WHERE id = helper_rec.id;
    END IF;
  END IF;

  IF remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Add coins to receiver
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id;

  -- Log the transfer
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, transfer_type, status)
  VALUES (_sender_id, _receiver_id, _amount, _sender_type, 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'amount', _amount,
    'agency_deducted', agency_deducted,
    'helper_deducted', helper_deducted
  );
END;
$$;

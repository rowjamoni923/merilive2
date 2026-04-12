
CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(_user_id uuid, _amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  helper_rec record;
  agency_rec record;
  remaining bigint := _amount;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  current_coins bigint;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Try helper wallet first
  SELECT * INTO helper_rec FROM topup_helpers WHERE user_id = _user_id FOR UPDATE;
  
  IF helper_rec IS NOT NULL AND helper_rec.wallet_balance >= remaining THEN
    UPDATE topup_helpers SET wallet_balance = wallet_balance - remaining, updated_at = now() WHERE id = helper_rec.id;
    helper_deducted := remaining;
    remaining := 0;
  ELSIF helper_rec IS NOT NULL AND helper_rec.wallet_balance > 0 THEN
    helper_deducted := helper_rec.wallet_balance::bigint;
    remaining := remaining - helper_deducted;
    UPDATE topup_helpers SET wallet_balance = 0, updated_at = now() WHERE id = helper_rec.id;
  END IF;

  -- If still remaining, try agency balance (if user is agency owner)
  IF remaining > 0 THEN
    SELECT * INTO agency_rec FROM agencies WHERE owner_id = _user_id FOR UPDATE;
    IF agency_rec IS NOT NULL AND agency_rec.diamond_balance >= remaining THEN
      UPDATE agencies SET diamond_balance = diamond_balance - remaining, updated_at = now() WHERE id = agency_rec.id;
      agency_deducted := remaining;
      remaining := 0;
    ELSIF agency_rec IS NOT NULL AND agency_rec.diamond_balance > 0 THEN
      agency_deducted := agency_rec.diamond_balance::bigint;
      remaining := remaining - agency_deducted;
      UPDATE agencies SET diamond_balance = diamond_balance - agency_deducted, updated_at = now() WHERE id = agency_rec.id;
    END IF;
  END IF;

  -- If still remaining, insufficient balance - rollback
  IF remaining > 0 THEN
    IF helper_deducted > 0 THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance + helper_deducted, updated_at = now() WHERE id = helper_rec.id;
    END IF;
    IF agency_deducted > 0 THEN
      UPDATE agencies SET diamond_balance = diamond_balance + agency_deducted, updated_at = now() WHERE id = agency_rec.id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;

  -- Add diamonds to user's own profile
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
  
  SELECT COALESCE(coins, 0) INTO current_coins FROM profiles WHERE id = _user_id;

  -- Log transfer
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, transfer_type, status)
  VALUES (_user_id, _user_id, _amount, 'self_recharge', 'completed');

  -- Return new balances
  RETURN jsonb_build_object(
    'success', true,
    'amount', _amount,
    'new_coins', current_coins,
    'new_wallet_balance', COALESCE((SELECT wallet_balance FROM topup_helpers WHERE user_id = _user_id), 0)
  );
END;
$$;

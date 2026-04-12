
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
  sender_coins bigint;
  agency_deducted bigint := 0;
  helper_deducted bigint := 0;
  user_deducted bigint := 0;
  remaining bigint := _amount;
BEGIN
  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- If agency transfer, try agency balance first
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

  -- If still remaining, try helper wallet
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

  -- If still remaining, deduct from sender's own profile coins
  IF remaining > 0 THEN
    SELECT COALESCE(coins, 0) INTO sender_coins FROM profiles WHERE id = _sender_id FOR UPDATE;
    IF sender_coins >= remaining THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET coins = coins - remaining WHERE id = _sender_id;
      user_deducted := remaining;
      remaining := 0;
    ELSE
      -- Rollback partial deductions by restoring
      IF agency_deducted > 0 THEN
        UPDATE agencies SET diamond_balance = diamond_balance + agency_deducted, updated_at = now() WHERE id = agency_rec.id;
      END IF;
      IF helper_deducted > 0 THEN
        UPDATE topup_helpers SET wallet_balance = wallet_balance + helper_deducted, updated_at = now() WHERE id = helper_rec.id;
      END IF;
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
    END IF;
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
    'helper_deducted', helper_deducted,
    'user_deducted', user_deducted
  );
END;
$$;

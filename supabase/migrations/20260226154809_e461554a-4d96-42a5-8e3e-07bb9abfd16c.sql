
-- Fix the check constraint to allow helper/trader sender types
ALTER TABLE public.coin_transfers DROP CONSTRAINT IF EXISTS coin_transfers_sender_type_check;
ALTER TABLE public.coin_transfers ADD CONSTRAINT coin_transfers_sender_type_check 
  CHECK (sender_type = ANY (ARRAY['agency'::text, 'admin'::text, 'helper'::text, 'trader'::text, 'trader_to_user'::text, 'agency_to_user'::text, 'agency_to_agency'::text, 'helper_to_user'::text]));

-- Also fix helper_transfer_coins_to_user to use a valid sender_type value
CREATE OR REPLACE FUNCTION public.helper_transfer_coins_to_user(
  _sender_id uuid,
  _receiver_id uuid,
  _amount integer,
  _sender_type text DEFAULT 'helper'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_is_helper boolean := false;
  v_is_agency_owner boolean := false;
  v_helper_id uuid;
  v_helper_balance bigint;
  v_agency_id uuid;
  v_agency_balance bigint;
  v_total_available bigint := 0;
  v_remaining integer;
  v_agency_deduct integer := 0;
  v_helper_deduct integer := 0;
  v_safe_sender_type text;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR v_caller != _sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Sanitize sender_type to allowed values
  v_safe_sender_type := CASE 
    WHEN _sender_type IN ('agency', 'admin', 'helper', 'trader', 'trader_to_user', 'agency_to_user', 'helper_to_user') THEN _sender_type
    ELSE 'helper'
  END;

  -- Check if sender is an active helper
  SELECT id, wallet_balance INTO v_helper_id, v_helper_balance
  FROM topup_helpers
  WHERE user_id = _sender_id AND is_active = true
  LIMIT 1;

  IF v_helper_id IS NOT NULL THEN
    v_is_helper := true;
    v_helper_balance := COALESCE(v_helper_balance, 0);
    v_total_available := v_total_available + v_helper_balance;
  END IF;

  -- Check if sender is an agency owner
  SELECT id, diamond_balance INTO v_agency_id, v_agency_balance
  FROM agencies
  WHERE owner_id = _sender_id AND is_active = true
  LIMIT 1;

  IF v_agency_id IS NOT NULL THEN
    v_is_agency_owner := true;
    v_agency_balance := COALESCE(v_agency_balance, 0);
    v_total_available := v_total_available + v_agency_balance;
  END IF;

  IF NOT v_is_helper AND NOT v_is_agency_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to transfer');
  END IF;

  IF _amount > v_total_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_remaining := _amount;

  -- Deduct from agency first
  IF v_is_agency_owner AND v_agency_balance > 0 AND v_remaining > 0 THEN
    v_agency_deduct := LEAST(v_remaining, v_agency_balance::integer);
    UPDATE agencies SET diamond_balance = diamond_balance - v_agency_deduct WHERE id = v_agency_id;
    v_remaining := v_remaining - v_agency_deduct;
  END IF;

  -- Deduct remainder from helper wallet
  IF v_is_helper AND v_remaining > 0 THEN
    v_helper_deduct := LEAST(v_remaining, v_helper_balance::integer);
    UPDATE topup_helpers SET wallet_balance = wallet_balance - v_helper_deduct WHERE id = v_helper_id AND wallet_balance >= v_helper_deduct;
    IF NOT FOUND THEN
      IF v_agency_deduct > 0 THEN
        UPDATE agencies SET diamond_balance = diamond_balance + v_agency_deduct WHERE id = v_agency_id;
      END IF;
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient helper wallet balance');
    END IF;
    v_remaining := v_remaining - v_helper_deduct;
  END IF;

  IF v_remaining > 0 THEN
    IF v_agency_deduct > 0 THEN
      UPDATE agencies SET diamond_balance = diamond_balance + v_agency_deduct WHERE id = v_agency_id;
    END IF;
    IF v_helper_deduct > 0 THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance + v_helper_deduct WHERE id = v_helper_id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Add coins to receiver
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id;
  IF NOT FOUND THEN
    IF v_agency_deduct > 0 THEN
      UPDATE agencies SET diamond_balance = diamond_balance + v_agency_deduct WHERE id = v_agency_id;
    END IF;
    IF v_helper_deduct > 0 THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance + v_helper_deduct WHERE id = v_helper_id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  -- Log transaction with safe sender_type
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, sender_type, note, status)
  VALUES (_sender_id, _receiver_id, _amount, v_safe_sender_type,
    'Transfer of ' || _amount || ' diamonds', 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'agency_deducted', v_agency_deduct,
    'helper_deducted', v_helper_deduct,
    'total_transferred', _amount
  );
END;
$$;

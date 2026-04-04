
-- Create a SECURITY DEFINER function for agency owner to send diamonds to a user
-- This bypasses RLS on profiles table for the coins update
CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_user(
  _agency_id uuid,
  _receiver_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_agency_owner_id uuid;
  v_current_balance bigint;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Verify caller owns this agency
  SELECT owner_id INTO v_agency_owner_id FROM agencies WHERE id = _agency_id AND is_active = true;
  IF v_agency_owner_id IS NULL OR v_agency_owner_id != v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not agency owner');
  END IF;

  -- Get fresh balance
  SELECT diamond_balance INTO v_current_balance FROM agencies WHERE id = _agency_id FOR UPDATE;
  v_current_balance := COALESCE(v_current_balance, 0);

  IF _amount > v_current_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance');
  END IF;

  -- Deduct from agency
  UPDATE agencies SET diamond_balance = diamond_balance - _amount WHERE id = _agency_id;

  -- Add to user coins
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id;
  IF NOT FOUND THEN
    -- Rollback
    UPDATE agencies SET diamond_balance = diamond_balance + _amount WHERE id = _agency_id;
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_agency_balance', v_current_balance - _amount);
END;
$$;

-- Create a function for agency-to-agency diamond transfer
-- Diamonds go to TARGET AGENCY's diamond_balance (not trader wallet)
CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_agency(
  _sender_agency_id uuid,
  _target_agency_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_sender_owner_id uuid;
  v_sender_balance bigint;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Verify caller owns sender agency
  SELECT owner_id INTO v_sender_owner_id FROM agencies WHERE id = _sender_agency_id AND is_active = true;
  IF v_sender_owner_id IS NULL OR v_sender_owner_id != v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not agency owner');
  END IF;

  -- Lock and check sender balance
  SELECT diamond_balance INTO v_sender_balance FROM agencies WHERE id = _sender_agency_id FOR UPDATE;
  v_sender_balance := COALESCE(v_sender_balance, 0);

  IF _amount > v_sender_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance');
  END IF;

  -- Verify target agency exists
  IF NOT EXISTS (SELECT 1 FROM agencies WHERE id = _target_agency_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target agency not found');
  END IF;

  -- Deduct from sender
  UPDATE agencies SET diamond_balance = diamond_balance - _amount WHERE id = _sender_agency_id;

  -- Add to target agency diamond_balance
  UPDATE agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _amount WHERE id = _target_agency_id;

  RETURN jsonb_build_object('success', true, 'new_sender_balance', v_sender_balance - _amount);
END;
$$;


-- Atomic coin deduction with balance check (prevents race conditions)
CREATE OR REPLACE FUNCTION public.deduct_coins(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS jsonb AS $$
DECLARE
  result_balance INTEGER;
  rows_affected INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE profiles
  SET coins = coins - p_amount
  WHERE id = p_user_id
    AND coins >= p_amount
  RETURNING coins INTO result_balance;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  IF rows_affected = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'new_balance', 0);
  ELSE
    RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atomic coin addition
CREATE OR REPLACE FUNCTION public.add_coins(
  p_user_id UUID,
  p_amount INTEGER
) RETURNS jsonb AS $$
DECLARE
  result_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE profiles
  SET coins = coins + p_amount
  WHERE id = p_user_id
  RETURNING coins INTO result_balance;

  IF result_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atomic coin transfer between users
CREATE OR REPLACE FUNCTION public.transfer_coins(
  p_from_user UUID,
  p_to_user UUID,
  p_amount INTEGER
) RETURNS jsonb AS $$
DECLARE
  sender_balance INTEGER;
  receiver_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Lock rows in consistent order to prevent deadlocks
  IF p_from_user < p_to_user THEN
    PERFORM id FROM profiles WHERE id = p_from_user FOR UPDATE;
    PERFORM id FROM profiles WHERE id = p_to_user FOR UPDATE;
  ELSE
    PERFORM id FROM profiles WHERE id = p_to_user FOR UPDATE;
    PERFORM id FROM profiles WHERE id = p_from_user FOR UPDATE;
  END IF;

  -- Deduct from sender
  UPDATE profiles
  SET coins = coins - p_amount
  WHERE id = p_from_user AND coins >= p_amount
  RETURNING coins INTO sender_balance;

  IF sender_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Add to receiver
  UPDATE profiles
  SET coins = coins + p_amount
  WHERE id = p_to_user
  RETURNING coins INTO receiver_balance;

  IF receiver_balance IS NULL THEN
    -- Rollback will happen automatically
    RAISE EXCEPTION 'Receiver not found';
  END IF;

  RETURN jsonb_build_object('success', true, 'sender_balance', sender_balance, 'receiver_balance', receiver_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add non-negative constraint on coins (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'coins_non_negative'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT coins_non_negative CHECK (coins >= 0);
  END IF;
END $$;


-- Drop old version with wrong parameter names
DROP FUNCTION IF EXISTS public.safe_credit_diamonds(uuid, integer, text, text);

-- Recreate with correct parameter names matching edge function calls
CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_gateway text DEFAULT 'auto',
  p_order_id text DEFAULT NULL,
  p_transaction_id text DEFAULT NULL,
  p_amount_usd numeric DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
  _existing_txn uuid;
  _payment_ref text;
BEGIN
  -- Build a unique payment reference for idempotency
  _payment_ref := COALESCE(p_order_id, '') || ':' || COALESCE(p_transaction_id, '');
  
  IF _payment_ref = ':' THEN
    _payment_ref := p_gateway || ':' || p_user_id::text || ':' || p_amount::text || ':' || extract(epoch from now())::text;
  END IF;

  -- Idempotency check — prevent double-credit
  SELECT id INTO _existing_txn
  FROM coin_transactions
  WHERE user_id = p_user_id
    AND payment_reference = _payment_ref
    AND status = 'completed'
  LIMIT 1;

  IF _existing_txn IS NOT NULL THEN
    RETURN json_build_object('success', true, 'already_credited', true, 'transaction_id', _existing_txn);
  END IF;

  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Bypass protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Credit diamonds (coins column is the real diamond balance)
  UPDATE profiles
  SET coins = COALESCE(coins, 0) + p_amount,
      total_recharged = COALESCE(total_recharged, 0) + p_amount
  WHERE id = p_user_id
  RETURNING coins INTO _new_balance;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Log the transaction
  INSERT INTO coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
  VALUES (p_user_id, p_amount, 'recharge', p_gateway, _payment_ref, 'completed',
    'order:' || COALESCE(p_order_id, 'N/A') || ' txn:' || COALESCE(p_transaction_id, 'N/A'));

  -- Log to reconciliation table if it exists
  BEGIN
    INSERT INTO payment_reconciliation_log (user_id, gateway, order_id, transaction_id, amount_coins, amount_usd, metadata, status)
    VALUES (p_user_id, p_gateway, p_order_id, p_transaction_id, p_amount, p_amount_usd, p_metadata, 'credited');
  EXCEPTION WHEN undefined_table THEN
    -- Table doesn't exist yet, skip
    NULL;
  END;

  RETURN json_build_object('success', true, 'new_balance', _new_balance, 'amount_credited', p_amount);
END;
$$;


-- ============================================================
-- FIX 1: add_diamonds_to_user — was updating wrong column (diamonds instead of coins)
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
END;
$$;

-- ============================================================
-- FIX 2: safe_credit_diamonds — idempotent diamond crediting for auto-recharge (ZiniPay, Stripe, etc.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(
  _user_id uuid,
  _amount integer,
  _payment_reference text,
  _payment_method text DEFAULT 'auto'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
  _existing_txn uuid;
BEGIN
  -- Idempotency check — prevent double-credit
  SELECT id INTO _existing_txn
  FROM coin_transactions
  WHERE user_id = _user_id
    AND payment_reference = _payment_reference
    AND status = 'completed'
  LIMIT 1;

  IF _existing_txn IS NOT NULL THEN
    RETURN json_build_object('success', true, 'already_credited', true, 'transaction_id', _existing_txn);
  END IF;

  IF _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Bypass protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Credit diamonds (coins column)
  UPDATE profiles
  SET coins = COALESCE(coins, 0) + _amount,
      total_recharged = COALESCE(total_recharged, 0) + _amount
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Log the transaction
  INSERT INTO coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status)
  VALUES (_user_id, _amount, 'recharge', _payment_method, _payment_reference, 'completed');

  RETURN json_build_object('success', true, 'new_balance', _new_balance, 'amount_credited', _amount);
END;
$$;

-- ============================================================
-- FIX 3: get_user_balance — unified balance fetcher
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_balance(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rec record;
BEGIN
  SELECT coins, beans, diamonds, total_consumption, total_recharged, total_earnings, pending_earnings
  INTO _rec
  FROM profiles
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN json_build_object(
    'success', true,
    'coins', COALESCE(_rec.coins, 0),
    'diamonds', COALESCE(_rec.coins, 0),
    'beans', COALESCE(_rec.beans, 0),
    'total_consumption', COALESCE(_rec.total_consumption, 0),
    'total_recharged', COALESCE(_rec.total_recharged, 0),
    'total_earnings', COALESCE(_rec.total_earnings, 0),
    'pending_earnings', COALESCE(_rec.pending_earnings, 0)
  );
END;
$$;

-- ============================================================
-- FIX 4: Add missing amount_local column to helper_orders (ZiniPay needs it)
-- ============================================================
ALTER TABLE public.helper_orders ADD COLUMN IF NOT EXISTS amount_local numeric DEFAULT 0;

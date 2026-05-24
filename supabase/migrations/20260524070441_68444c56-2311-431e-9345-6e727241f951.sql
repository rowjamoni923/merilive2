-- Section #6 Recharge pass-7: standard gateway approval hardening

-- 1) Prevent reusing the same gateway receipt/transaction ID while a payment is active or completed.
-- Use the actual live schema columns: payment_method + external_transaction_id.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_payment_tx_gateway_receipt_active
  ON public.payment_transactions (
    lower(coalesce(payment_method, '')),
    lower(coalesce(external_transaction_id, ''))
  )
  WHERE external_transaction_id IS NOT NULL
    AND trim(external_transaction_id) <> ''
    AND status IN ('pending', 'processing', 'completed');

-- 2) Atomic admin approval for standard manual gateway payments.
-- IMPORTANT: credit amount is recalculated from coin_packages, not trusted from payment_transactions.diamonds_amount.
CREATE OR REPLACE FUNCTION public.admin_complete_payment_transaction(_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.payment_transactions%ROWTYPE;
  v_pkg record;
  v_credit_amount integer;
  v_balance_before bigint;
  v_balance_after bigint;
  v_payment_ref text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT * INTO v_tx
  FROM public.payment_transactions
  WHERE id = _transaction_id
  FOR UPDATE;

  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'transaction_not_found');
  END IF;

  IF COALESCE(v_tx.status, 'pending') = 'completed' THEN
    SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = v_tx.user_id;
    RETURN jsonb_build_object(
      'success', true,
      'alreadyProcessed', true,
      'creditedCoins', COALESCE(v_tx.diamonds_amount, 0),
      'newBalance', COALESCE(v_balance_after, 0)
    );
  END IF;

  IF COALESCE(v_tx.status, 'pending') NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'status', v_tx.status);
  END IF;

  IF v_tx.package_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_package');
  END IF;

  SELECT
    id,
    price_usd,
    coins_amount,
    COALESCE(bonus_coins, 0) AS bonus_coins,
    (coins_amount + COALESCE(bonus_coins, 0)) AS total_coins
  INTO v_pkg
  FROM public.coin_packages
  WHERE id = v_tx.package_id
    AND is_active = true
  LIMIT 1;

  IF v_pkg.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'package_not_found_or_inactive');
  END IF;

  v_credit_amount := GREATEST(COALESCE(v_pkg.total_coins, 0), 0);
  IF v_credit_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_package_coin_amount');
  END IF;

  SELECT COALESCE(coins, 0) INTO v_balance_before
  FROM public.profiles
  WHERE id = v_tx.user_id
  FOR UPDATE;

  IF v_balance_before IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_payment_ref := 'payment_tx:' || v_tx.id::text;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.coin_transactions (
    user_id,
    coins_amount,
    transaction_type,
    payment_method,
    payment_reference,
    status,
    notes
  ) VALUES (
    v_tx.user_id,
    v_credit_amount,
    'recharge',
    COALESCE(v_tx.payment_method, 'manual_gateway'),
    v_payment_ref,
    'completed',
    'Admin-approved standard gateway recharge. Txn: ' || v_tx.id::text
  );

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + v_credit_amount,
      total_recharged = COALESCE(total_recharged, 0) + v_credit_amount,
      updated_at = now()
  WHERE id = v_tx.user_id
  RETURNING COALESCE(coins, 0) INTO v_balance_after;

  UPDATE public.payment_transactions
  SET status = 'completed',
      amount_usd = v_pkg.price_usd,
      diamonds_amount = v_credit_amount,
      updated_at = now(),
      notes = concat_ws(E'\n', NULLIF(notes, ''), jsonb_build_object(
        'admin_completed_at', now(),
        'canonical_package_id', v_pkg.id,
        'canonical_price_usd', v_pkg.price_usd,
        'canonical_base_coins', v_pkg.coins_amount,
        'canonical_bonus_coins', v_pkg.bonus_coins,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after,
        'payment_reference', v_payment_ref
      )::text)
  WHERE id = v_tx.id;

  INSERT INTO public.payment_reconciliation_log (
    event_type,
    gateway,
    user_id,
    order_id,
    transaction_id,
    amount_coins,
    amount_usd,
    balance_before,
    balance_after,
    metadata
  ) VALUES (
    'credit_success',
    COALESCE(v_tx.payment_method, 'manual_gateway'),
    v_tx.user_id,
    v_tx.id::text,
    COALESCE(v_tx.external_transaction_id, v_tx.transaction_ref),
    v_credit_amount,
    v_pkg.price_usd,
    v_balance_before,
    v_balance_after,
    jsonb_build_object('source', 'admin_complete_payment_transaction', 'package_id', v_pkg.id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'alreadyProcessed', false,
    'creditedCoins', v_credit_amount,
    'newBalance', v_balance_after,
    'balanceBefore', v_balance_before,
    'priceUsd', v_pkg.price_usd
  );
EXCEPTION WHEN unique_violation THEN
  SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = COALESCE(v_tx.user_id, auth.uid());
  RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'newBalance', COALESCE(v_balance_after, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_payment_transaction(_transaction_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT status INTO v_status FROM public.payment_transactions WHERE id = _transaction_id FOR UPDATE;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'transaction_not_found');
  END IF;
  IF v_status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'cannot_reject_completed');
  END IF;

  UPDATE public.payment_transactions
  SET status = 'failed',
      updated_at = now(),
      notes = concat_ws(E'\n', NULLIF(notes, ''), jsonb_build_object('admin_rejected_at', now(), 'reason', _reason)::text)
  WHERE id = _transaction_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_complete_payment_transaction(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.admin_reject_payment_transaction(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_transaction(uuid, text) TO anon, authenticated;
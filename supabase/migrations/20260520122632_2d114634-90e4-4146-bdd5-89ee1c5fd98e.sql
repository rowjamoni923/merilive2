-- ============================================================
-- Pkg55: Recharge double-credit hard-lock (defense-in-depth)
-- ============================================================

-- 1) DB-level UNIQUE on coin_transactions payment_reference per user
--    (safe_credit_diamonds idempotency is now enforced by Postgres, not application-level)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_coin_tx_payment_ref_completed
  ON public.coin_transactions (user_id, payment_reference)
  WHERE status = 'completed'
    AND payment_reference IS NOT NULL
    AND payment_reference <> '';

-- 2) DB-level UNIQUE on recharge_transactions for non-google gateways
--    (Google already has its own unique indexes)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recharge_tx_gateway_txn_completed
  ON public.recharge_transactions (payment_method, transaction_id)
  WHERE status = 'completed'
    AND payment_method IS NOT NULL
    AND payment_method NOT IN ('google_play')
    AND transaction_id IS NOT NULL
    AND transaction_id <> '';

-- 3) Rewrite safe_credit_diamonds: INSERT-first pattern.
--    INSERT into coin_transactions hits UNIQUE constraint atomically.
--    On conflict → another request already credited → return already_credited.
--    Only the winning row proceeds to update profile.coins.
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
SET search_path TO 'public'
AS $function$
DECLARE
  _new_balance integer;
  _payment_ref text;
  _inserted_id uuid;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Build deterministic idempotency key
  _payment_ref := COALESCE(p_order_id, '') || ':' || COALESCE(p_transaction_id, '');
  IF _payment_ref = ':' THEN
    -- No order/txn id supplied — fall back to a unique synthetic key (cannot dedupe)
    _payment_ref := p_gateway || ':' || p_user_id::text || ':' || p_amount::text || ':' || extract(epoch from clock_timestamp())::text;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- INSERT FIRST — UNIQUE INDEX uniq_coin_tx_payment_ref_completed serializes concurrent webhooks
  BEGIN
    INSERT INTO public.coin_transactions (
      user_id, coins_amount, transaction_type, payment_method,
      payment_reference, status, notes
    )
    VALUES (
      p_user_id, p_amount, 'recharge', p_gateway,
      _payment_ref, 'completed',
      'order:' || COALESCE(p_order_id, 'N/A') || ' txn:' || COALESCE(p_transaction_id, 'N/A')
    )
    RETURNING id INTO _inserted_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another concurrent call already credited this exact payment — safe no-op
    RETURN json_build_object(
      'success', true,
      'already_credited', true,
      'payment_reference', _payment_ref
    );
  END;

  -- Only the winning INSERT reaches here — credit profile atomically
  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + p_amount,
         total_recharged = COALESCE(total_recharged, 0) + p_amount
   WHERE id = p_user_id
   RETURNING coins INTO _new_balance;

  IF NOT FOUND THEN
    -- User vanished mid-flight; roll back the log row to keep books honest
    DELETE FROM public.coin_transactions WHERE id = _inserted_id;
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Reconciliation log (best-effort)
  BEGIN
    INSERT INTO public.payment_reconciliation_log (
      user_id, gateway, order_id, transaction_id,
      amount_coins, amount_usd, metadata, status
    )
    VALUES (
      p_user_id, p_gateway, p_order_id, p_transaction_id,
      p_amount, p_amount_usd, p_metadata, 'credited'
    );
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN json_build_object(
    'success', true,
    'new_balance', _new_balance,
    'amount_credited', p_amount,
    'payment_reference', _payment_ref
  );
END;
$function$;

-- =====================================================================
-- Phase 4B Round 1 — Recharge / Payment RPC hardening
-- =====================================================================

-- B1, B2, B3 — REVOKE anon/PUBLIC on money-credit RPCs.
-- Internal admin gates inside each function remain unchanged.

REVOKE EXECUTE ON FUNCTION public.process_google_play_purchase(uuid, text, text, text, jsonb) FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.add_coins_to_user(uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_diamonds_to_user(uuid, integer) FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.admin_add_user_coins(uuid, bigint, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_add_agency_coins(uuid, numeric, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_credit_beans(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_approve_helper_topup(uuid, numeric, text) FROM anon, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.auto_grant_helper_from_crypto_payment(uuid, integer, text, text, text, boolean) FROM anon, PUBLIC;

-- =====================================================================
-- B4 — process_google_play_purchase: add coin_transactions ledger row
-- =====================================================================
CREATE OR REPLACE FUNCTION public.process_google_play_purchase(
  p_user_id uuid,
  p_product_id text,
  p_purchase_token text,
  p_google_order_id text DEFAULT NULL::text,
  p_google_payload jsonb DEFAULT '{}'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg record;
  v_existing record;
  v_balance_before bigint;
  v_balance_after bigint;
  v_order_id text;
  v_notes text;
  v_requested_product text;
  v_payment_ref text;
BEGIN
  v_requested_product := trim(COALESCE(p_product_id, ''));

  IF p_user_id IS NULL OR v_requested_product = '' OR p_purchase_token IS NULL OR trim(p_purchase_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_required_fields');
  END IF;

  SELECT
    cp.id,
    cp.product_id,
    cp.coins_amount,
    COALESCE(cp.bonus_coins, 0) AS bonus_coins,
    (cp.coins_amount + COALESCE(cp.bonus_coins, 0)) AS total_coins,
    cp.price_usd
  INTO v_pkg
  FROM public.coin_packages cp
  WHERE cp.is_active = true
    AND lower(v_requested_product) IN (
      lower(trim(COALESCE(cp.product_id, ''))),
      lower('diamonds_' || cp.coins_amount::text),
      lower('coins_' || cp.coins_amount::text),
      lower('diamonds_' || (cp.coins_amount + COALESCE(cp.bonus_coins, 0))::text),
      lower('coins_' || (cp.coins_amount + COALESCE(cp.bonus_coins, 0))::text)
    )
  LIMIT 1;

  IF v_pkg IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_product_id');
  END IF;

  v_order_id := NULLIF(trim(COALESCE(p_google_order_id, '')), '');

  SELECT id, user_id, coins_received, google_order_id, transaction_id
  INTO v_existing
  FROM public.recharge_transactions
  WHERE payment_method = 'google_play'
    AND (
      transaction_id = p_purchase_token
      OR (v_order_id IS NOT NULL AND google_order_id = v_order_id)
    )
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
    IF v_existing.user_id = p_user_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'alreadyProcessed', true,
        'coins', COALESCE(v_existing.coins_received, v_pkg.total_coins),
        'newBalance', COALESCE(v_balance_after, 0),
        'transactionId', v_existing.id
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'purchase_token_already_used');
  END IF;

  SELECT COALESCE(coins, 0) INTO v_balance_before
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance_before IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + v_pkg.total_coins,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING COALESCE(coins, 0) INTO v_balance_after;

  v_notes := 'Server-verified Google Play purchase. Product: ' || v_requested_product || '. Order: ' || COALESCE(v_order_id, 'N/A');

  INSERT INTO public.recharge_transactions (
    user_id, order_id, payment_method, amount, coins_amount, bonus_coins,
    status, processed_at, created_at, updated_at, currency, usd_amount,
    coins_received, completed_at, currency_code, google_order_id,
    google_product_id, notes, purchase_source, transaction_id
  ) VALUES (
    p_user_id, v_order_id, 'google_play', v_pkg.price_usd, v_pkg.total_coins, v_pkg.bonus_coins,
    'completed', now(), now(), now(), 'USD', v_pkg.price_usd,
    v_pkg.total_coins, now(), 'USD', v_order_id,
    v_requested_product, v_notes, 'google_play', p_purchase_token
  );

  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
  VALUES (p_user_id, p_user_id, v_pkg.total_coins, 'google_play', 'completed', 'Google Play purchase: ' || v_requested_product);

  -- 🆕 B4: Canonical coin_transactions ledger row (idempotent via uniq_coin_tx_payment_ref_completed).
  v_payment_ref := 'google_play:' || p_purchase_token;
  BEGIN
    INSERT INTO public.coin_transactions (
      user_id, coins_amount, transaction_type, payment_method,
      payment_reference, status, notes
    ) VALUES (
      p_user_id,
      LEAST(v_pkg.total_coins, 2147483000),
      'recharge',
      'google_play',
      v_payment_ref,
      'completed',
      v_notes
    );
  EXCEPTION WHEN unique_violation THEN
    -- ledger row already exists from a previous successful run — safe to ignore
    NULL;
  END;

  INSERT INTO public.payment_reconciliation_log (
    event_type, gateway, user_id, order_id, transaction_id, amount_coins,
    amount_usd, balance_before, balance_after, metadata
  ) VALUES (
    'credit_success', 'google_play', p_user_id,
    COALESCE(v_order_id, p_purchase_token), p_purchase_token,
    v_pkg.total_coins, v_pkg.price_usd, v_balance_before, v_balance_after,
    jsonb_build_object(
      'product_id', v_requested_product,
      'canonical_product_id', v_pkg.product_id,
      'package_id', v_pkg.id,
      'google_order_id', v_order_id,
      'google_payload', p_google_payload
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'alreadyProcessed', false,
    'coins', v_pkg.total_coins,
    'baseCoins', v_pkg.coins_amount,
    'bonusCoins', v_pkg.bonus_coins,
    'priceUsd', v_pkg.price_usd,
    'newBalance', v_balance_after
  );
EXCEPTION WHEN unique_violation THEN
  SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'coins', COALESCE(v_pkg.total_coins, 0), 'newBalance', COALESCE(v_balance_after, 0));
END;
$function$;

-- Re-grant the legitimate callers (edge function uses service_role, admins via authenticated JWT)
REVOKE EXECUTE ON FUNCTION public.process_google_play_purchase(uuid, text, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_google_play_purchase(uuid, text, text, text, jsonb) TO service_role;

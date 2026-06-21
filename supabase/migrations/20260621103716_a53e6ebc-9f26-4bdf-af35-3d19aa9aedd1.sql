-- Runtime-safety fix for referral purchase qualification functions.

CREATE OR REPLACE FUNCTION public.admin_complete_payment_transaction(_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tx public.payment_transactions%ROWTYPE;
  v_pkg record;
  v_credit_amount integer;
  v_balance_before bigint;
  v_balance_after bigint;
  v_payment_ref text;
  v_invite_result jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','recharge','topup-system','payment-gateways','manual-topup'], true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized_for_finance');
  END IF;

  SELECT * INTO v_tx FROM public.payment_transactions WHERE id = _transaction_id FOR UPDATE;
  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'transaction_not_found');
  END IF;
  IF COALESCE(v_tx.status, 'pending') = 'completed' THEN
    SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = v_tx.user_id;
    v_invite_result := public.qualify_invitation_after_purchase(v_tx.user_id, v_tx.amount_usd, v_tx.diamonds_amount, 'payment_transaction', v_tx.id::text);
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'creditedCoins', COALESCE(v_tx.diamonds_amount, 0), 'newBalance', COALESCE(v_balance_after, 0), 'invitation', v_invite_result);
  END IF;
  IF COALESCE(v_tx.status, 'pending') NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'status', v_tx.status);
  END IF;
  IF v_tx.package_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_package');
  END IF;

  SELECT id, price_usd, coins_amount, COALESCE(bonus_coins, 0) AS bonus_coins,
         (coins_amount + COALESCE(bonus_coins, 0)) AS total_coins
    INTO v_pkg
    FROM public.coin_packages
   WHERE id = v_tx.package_id AND is_active = true
   LIMIT 1;
  IF v_pkg.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'package_not_found_or_inactive');
  END IF;

  v_credit_amount := GREATEST(COALESCE(v_pkg.total_coins, 0), 0);
  IF v_credit_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_package_coin_amount');
  END IF;

  SELECT COALESCE(coins, 0) INTO v_balance_before FROM public.profiles WHERE id = v_tx.user_id FOR UPDATE;
  IF v_balance_before IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_payment_ref := 'payment_tx:' || v_tx.id::text;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
  VALUES (v_tx.user_id, v_credit_amount, 'recharge', COALESCE(v_tx.payment_method, 'admin_payment'), v_payment_ref, 'completed', 'Admin completed payment ' || v_tx.id::text);

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + v_credit_amount,
         total_recharged = COALESCE(total_recharged, 0) + COALESCE(v_pkg.price_usd, 0)
   WHERE id = v_tx.user_id;

  UPDATE public.payment_transactions
     SET status = 'completed', updated_at = now()
   WHERE id = _transaction_id;

  v_invite_result := public.qualify_invitation_after_purchase(v_tx.user_id, COALESCE(v_tx.amount_usd, v_pkg.price_usd), v_credit_amount, 'payment_transaction', v_tx.id::text);
  v_balance_after := v_balance_before + v_credit_amount;

  RETURN jsonb_build_object('success', true, 'creditedCoins', v_credit_amount, 'newBalance', v_balance_after, 'invitation', v_invite_result);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) TO service_role;

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
  v_invite_result jsonb;
BEGIN
  v_requested_product := trim(COALESCE(p_product_id, ''));

  IF p_user_id IS NULL OR v_requested_product = '' OR p_purchase_token IS NULL OR trim(p_purchase_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_required_fields');
  END IF;

  SELECT cp.id, cp.product_id, cp.coins_amount, COALESCE(cp.bonus_coins, 0) AS bonus_coins,
         (cp.coins_amount + COALESCE(cp.bonus_coins, 0)) AS total_coins, cp.price_usd
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
     AND (transaction_id = p_purchase_token OR (v_order_id IS NOT NULL AND google_order_id = v_order_id))
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
    IF v_existing.user_id = p_user_id THEN
      v_invite_result := public.qualify_invitation_after_purchase(p_user_id, v_pkg.price_usd, v_pkg.total_coins, 'google_play', COALESCE(v_order_id, p_purchase_token));
      RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'coins', COALESCE(v_existing.coins_received, v_pkg.total_coins), 'newBalance', COALESCE(v_balance_after, 0), 'transactionId', v_existing.id, 'invitation', v_invite_result);
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'purchase_token_already_used');
  END IF;

  SELECT COALESCE(coins, 0) INTO v_balance_before FROM public.profiles WHERE id = p_user_id FOR UPDATE;
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

  v_payment_ref := 'google_play:' || p_purchase_token;
  BEGIN
    INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
    VALUES (p_user_id, LEAST(v_pkg.total_coins, 2147483000), 'recharge', 'google_play', v_payment_ref, 'completed', v_notes);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.payment_reconciliation_log (external_reference, amount, currency, status, reconciled_at, notes)
    VALUES (COALESCE(v_order_id, p_purchase_token), v_pkg.price_usd, 'USD', 'credited', now(), v_notes);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  v_invite_result := public.qualify_invitation_after_purchase(p_user_id, v_pkg.price_usd, v_pkg.total_coins, 'google_play', COALESCE(v_order_id, p_purchase_token));

  RETURN jsonb_build_object('success', true, 'alreadyProcessed', false, 'coins', v_pkg.total_coins, 'baseCoins', v_pkg.coins_amount, 'bonusCoins', v_pkg.bonus_coins, 'priceUsd', v_pkg.price_usd, 'newBalance', v_balance_after, 'invitation', v_invite_result);
EXCEPTION WHEN unique_violation THEN
  SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
  v_invite_result := public.qualify_invitation_after_purchase(p_user_id, v_pkg.price_usd, COALESCE(v_pkg.total_coins, 0), 'google_play', COALESCE(v_order_id, p_purchase_token));
  RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'coins', COALESCE(v_pkg.total_coins, 0), 'newBalance', COALESCE(v_balance_after, 0), 'invitation', v_invite_result);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_google_play_purchase(uuid, text, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_google_play_purchase(uuid, text, text, text, jsonb) TO service_role;
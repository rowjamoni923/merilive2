CREATE OR REPLACE FUNCTION public.admin_recover_purchase_credit(
  p_user_id uuid,
  p_coin_amount integer,
  p_google_order_id text DEFAULT NULL,
  p_product_id text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pkg record;
  v_profile record;
  v_balance_before bigint := 0;
  v_balance_after bigint := 0;
  v_diamonds_after integer := 0;
  v_order_id text;
  v_product text;
  v_base_coins integer := 0;
  v_package_bonus integer := 0;
  v_credit_coins integer := 0;
  v_price_usd numeric := 0;
  v_recharge_id uuid;
  v_payment_ref text;
  v_notes text;
  v_bonus_result jsonb := NULL;
  v_invite_result jsonb := NULL;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_user_id IS NULL OR COALESCE(p_coin_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'userId and positive coinAmount are required');
  END IF;

  v_product := trim(COALESCE(p_product_id, ''));

  SELECT cp.id, cp.product_id, cp.coins_amount, COALESCE(cp.bonus_coins, 0) AS bonus_coins,
         (cp.coins_amount + COALESCE(cp.bonus_coins, 0)) AS total_coins,
         cp.price_usd
    INTO v_pkg
    FROM public.coin_packages cp
   WHERE cp.is_active = true
     AND (
       (v_product <> '' AND lower(v_product) IN (
         lower(trim(COALESCE(cp.product_id, ''))),
         lower('diamonds_' || cp.coins_amount::text),
         lower('coins_' || cp.coins_amount::text),
         lower('diamonds_' || (cp.coins_amount + COALESCE(cp.bonus_coins, 0))::text),
         lower('coins_' || (cp.coins_amount + COALESCE(cp.bonus_coins, 0))::text)
       ))
       OR (v_product = '' AND (cp.coins_amount = p_coin_amount OR (cp.coins_amount + COALESCE(cp.bonus_coins, 0)) = p_coin_amount))
     )
   ORDER BY CASE WHEN cp.coins_amount = p_coin_amount THEN 0 ELSE 1 END, cp.price_usd NULLS LAST
   LIMIT 1;

  IF v_pkg IS NOT NULL THEN
    v_product := v_pkg.product_id;
    v_base_coins := v_pkg.coins_amount;
    v_package_bonus := v_pkg.bonus_coins;
    v_credit_coins := v_pkg.total_coins;
    v_price_usd := COALESCE(v_pkg.price_usd, 0);
  ELSE
    v_base_coins := p_coin_amount;
    v_package_bonus := 0;
    v_credit_coins := p_coin_amount;
    v_price_usd := 0;
  END IF;

  v_order_id := NULLIF(trim(COALESCE(p_google_order_id, '')), '');
  IF v_order_id IS NULL THEN
    v_order_id := 'admin_recovery_' || replace(gen_random_uuid()::text, '-', '');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.recharge_transactions
     WHERE google_order_id = v_order_id OR transaction_id = v_order_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This order has already been credited', 'alreadyCredited', true);
  END IF;

  SELECT id, COALESCE(coins, 0) AS coins, COALESCE(diamonds, 0) AS diamonds
    INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_balance_before := v_profile.coins;
  v_notes := 'Admin purchase recovery. Reason: ' || COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Purchase not delivered');
  v_payment_ref := 'admin_recovery:' || v_order_id;

  INSERT INTO public.recharge_transactions (
    user_id, order_id, payment_method, amount, coins_amount, bonus_coins,
    status, processed_at, created_at, updated_at, currency, usd_amount,
    coins_received, completed_at, currency_code, google_order_id,
    google_product_id, notes, purchase_source, transaction_id, processed_by
  ) VALUES (
    p_user_id, v_order_id, 'admin_manual_recovery', v_price_usd, v_credit_coins, v_package_bonus,
    'completed', now(), now(), now(), 'USD', v_price_usd,
    v_credit_coins, now(), 'USD', v_order_id,
    NULLIF(v_product, ''), v_notes, 'admin_manual', v_order_id, p_admin_id
  ) RETURNING id INTO v_recharge_id;

  PERFORM set_config('app.wallet_ctx', jsonb_build_object(
    'source_type', 'admin_purchase_recovery',
    'source_id', v_recharge_id::text,
    'source_table', 'recharge_transactions',
    'payment_method', 'admin_manual_recovery',
    'payment_reference', v_payment_ref,
    'admin_id', COALESCE(p_admin_id::text, ''),
    'google_order_id', v_order_id,
    'product_id', NULLIF(v_product, ''),
    'base_coins', v_base_coins,
    'package_bonus_coins', v_package_bonus
  )::text, true);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + v_credit_coins,
         updated_at = now()
   WHERE id = p_user_id
   RETURNING COALESCE(coins, 0), COALESCE(diamonds, 0)
      INTO v_balance_after, v_diamonds_after;

  BEGIN
    INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
    VALUES (p_user_id, LEAST(v_credit_coins, 2147483000), 'recharge', 'admin_manual_recovery', v_payment_ref, 'completed', v_notes);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    v_bonus_result := public._apply_recharge_bonuses_internal(p_user_id, v_credit_coins, v_recharge_id::text);
    SELECT COALESCE(coins, 0), COALESCE(diamonds, 0)
      INTO v_balance_after, v_diamonds_after
      FROM public.profiles
     WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  BEGIN
    v_invite_result := public.qualify_invitation_after_purchase(p_user_id, v_price_usd, v_credit_coins, 'admin_manual_recovery', v_payment_ref);
  EXCEPTION WHEN OTHERS THEN
    v_invite_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'success', true,
    'coinAmount', v_credit_coins,
    'baseCoins', v_base_coins,
    'packageBonusCoins', v_package_bonus,
    'newBalance', v_balance_after,
    'diamondsBalance', v_diamonds_after,
    'transactionId', v_recharge_id,
    'googleOrderId', v_order_id,
    'productId', NULLIF(v_product, ''),
    'priceUsd', v_price_usd,
    'recharge_bonus', v_bonus_result,
    'firstRechargeBonusCoins', COALESCE((v_bonus_result->>'first_recharge_bonus_coins')::integer, 0),
    'vipBonusDiamonds', COALESCE((v_bonus_result->'vip_bonus'->>'bonus_diamonds')::integer, 0),
    'invitation', v_invite_result
  );
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'This order has already been credited', 'alreadyCredited', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_google_play_purchase(p_user_id uuid, p_product_id text, p_purchase_token text, p_google_order_id text DEFAULT NULL::text, p_google_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  v_bonus_result jsonb := NULL;
  v_recharge_id uuid;
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
  ) RETURNING id INTO v_recharge_id;

  v_payment_ref := 'google_play:' || p_purchase_token;

  PERFORM set_config('app.wallet_ctx', jsonb_build_object(
    'source_type', 'google_play_purchase',
    'source_id', v_recharge_id::text,
    'source_table', 'recharge_transactions',
    'payment_method', 'google_play',
    'payment_reference', v_payment_ref,
    'google_order_id', v_order_id,
    'product_id', v_requested_product,
    'base_coins', v_pkg.coins_amount,
    'package_bonus_coins', v_pkg.bonus_coins
  )::text, true);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + v_pkg.total_coins,
         updated_at = now()
   WHERE id = p_user_id
   RETURNING COALESCE(coins, 0) INTO v_balance_after;

  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
  VALUES (p_user_id, p_user_id, v_pkg.total_coins, 'google_play', 'completed', 'Google Play purchase: ' || v_requested_product);

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

  BEGIN
    v_bonus_result := public._apply_recharge_bonuses_internal(p_user_id, v_pkg.total_coins, v_recharge_id::text);
    SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  v_invite_result := public.qualify_invitation_after_purchase(p_user_id, v_pkg.price_usd, v_pkg.total_coins, 'google_play', COALESCE(v_order_id, p_purchase_token));

  RETURN jsonb_build_object(
    'success', true,
    'alreadyProcessed', false,
    'coins', v_pkg.total_coins,
    'baseCoins', v_pkg.coins_amount,
    'bonusCoins', v_pkg.bonus_coins,
    'priceUsd', v_pkg.price_usd,
    'newBalance', v_balance_after,
    'transactionId', v_recharge_id,
    'invitation', v_invite_result,
    'recharge_bonus', v_bonus_result
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_google_play_purchase(uuid, text, text, text, jsonb) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_google_play_purchase(uuid, text, text, text, jsonb) TO service_role;
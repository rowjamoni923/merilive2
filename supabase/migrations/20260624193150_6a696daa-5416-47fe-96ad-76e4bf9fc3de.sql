CREATE OR REPLACE FUNCTION public.process_google_play_purchase(p_user_id uuid, p_product_id text, p_purchase_token text, p_google_order_id text DEFAULT NULL::text, p_google_payload jsonb DEFAULT '{}'::jsonb)
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
  v_bonus_result jsonb := NULL;
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

  -- 🔧 BUG #1 FIX: Apply recharge bonuses (first-recharge + VIP/Noble) for Google Play buyers.
  -- Helper + Crypto paths already did this; only Google Play was missing it.
  -- Wrapped in BEGIN/EXCEPTION so any bonus-calc error cannot rollback the main coin credit.
  BEGIN
    v_bonus_result := public._apply_recharge_bonuses_internal(
      p_user_id,
      v_pkg.total_coins,
      COALESCE(v_order_id, p_purchase_token)
    );
    -- Refresh balance after bonus credit so client sees the final number.
    SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Never break the main purchase flow if bonus application fails. Log via notes.
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
    'invitation', v_invite_result,
    'recharge_bonus', v_bonus_result
  );
EXCEPTION WHEN unique_violation THEN
  SELECT COALESCE(coins, 0) INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
  v_invite_result := public.qualify_invitation_after_purchase(p_user_id, v_pkg.price_usd, COALESCE(v_pkg.total_coins, 0), 'google_play', COALESCE(v_order_id, p_purchase_token));
  RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'coins', COALESCE(v_pkg.total_coins, 0), 'newBalance', COALESCE(v_balance_after, 0), 'invitation', v_invite_result);
END;
$function$;
-- Referral + agency link flow hardening (2026-06-21)

-- 1) Invitation attribution must start pending; verification happens only after qualified paid purchase.
CREATE OR REPLACE FUNCTION public.record_invitation(_inviter_app_uid text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _invitee uuid;
  _inviter uuid;
  _existing public.user_invitations%ROWTYPE;
BEGIN
  _invitee := auth.uid();
  IF _invitee IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _inviter_app_uid IS NULL OR length(btrim(_inviter_app_uid)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing inviter');
  END IF;

  SELECT id INTO _inviter
  FROM public.profiles
  WHERE upper(app_uid::text) = upper(btrim(_inviter_app_uid))
    AND COALESCE(is_banned, false) = false
    AND COALESCE(is_deleted, false) = false
  LIMIT 1;

  IF _inviter IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Inviter not found');
  END IF;

  IF _inviter = _invitee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot self-invite');
  END IF;

  SELECT * INTO _existing
  FROM public.user_invitations
  WHERE invitee_id = _invitee
  LIMIT 1;

  IF _existing.id IS NOT NULL THEN
    IF _existing.inviter_id = _inviter THEN
      RETURN jsonb_build_object('success', true, 'alreadyAttributed', true, 'status', _existing.status);
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Already attributed');
  END IF;

  INSERT INTO public.user_invitations (inviter_id, invitee_id, invitation_code, status, completed_at)
  VALUES (_inviter, _invitee, btrim(_inviter_app_uid), 'pending', NULL)
  ON CONFLICT (inviter_id, invitee_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'status', 'pending');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invitation(text) TO service_role;

-- 2) Shared qualification function: invite counts after >= $2 completed paid purchase total.
CREATE OR REPLACE FUNCTION public.qualify_invitation_after_purchase(
  p_user_id uuid,
  p_amount_usd numeric DEFAULT NULL::numeric,
  p_amount_coins bigint DEFAULT NULL::bigint,
  p_source text DEFAULT NULL::text,
  p_reference text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_threshold numeric := 2.00;
  v_total_usd numeric := 0;
  v_updated int := 0;
  v_source text := lower(trim(COALESCE(p_source, '')));
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_user');
  END IF;

  -- Guard against non-purchase credits accidentally qualifying referrals.
  IF v_source IN ('admin', 'admin_credit', 'manual_admin', 'promo', 'promotion', 'bonus', 'gift', 'game', 'refund', 'reversal') THEN
    RETURN jsonb_build_object('success', true, 'qualified', false, 'skipped', 'non_purchase_source');
  END IF;

  SELECT COALESCE(SUM(amount_usd), 0)
  INTO v_total_usd
  FROM public.payment_transactions
  WHERE user_id = p_user_id
    AND status = 'completed';

  SELECT v_total_usd + COALESCE(SUM(usd_amount), 0)
  INTO v_total_usd
  FROM public.recharge_transactions
  WHERE user_id = p_user_id
    AND status = 'completed';

  SELECT v_total_usd + COALESCE(SUM(amount_usd), 0)
  INTO v_total_usd
  FROM public.helper_orders
  WHERE COALESCE(user_id, customer_id) = p_user_id
    AND status = 'completed';

  IF COALESCE(p_amount_usd, 0) > 0 THEN
    v_total_usd := GREATEST(v_total_usd, COALESCE(p_amount_usd, 0));
  END IF;

  IF v_total_usd < v_threshold THEN
    RETURN jsonb_build_object(
      'success', true,
      'qualified', false,
      'total_usd', v_total_usd,
      'threshold_usd', v_threshold
    );
  END IF;

  UPDATE public.user_invitations
     SET status = 'verified', completed_at = COALESCE(completed_at, now())
   WHERE invitee_id = p_user_id
     AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'qualified', true,
    'updated', v_updated,
    'total_usd', v_total_usd,
    'threshold_usd', v_threshold,
    'source', p_source,
    'reference', p_reference
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.qualify_invitation_after_purchase(uuid, numeric, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.qualify_invitation_after_purchase(uuid, numeric, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.qualify_invitation_after_purchase(uuid, numeric, bigint, text, text) TO service_role;

-- 3) Standard gateway/admin approval now qualifies invitation after paid completion.
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
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true,
      'creditedCoins', COALESCE(v_tx.diamonds_amount, 0), 'newBalance', COALESCE(v_balance_after, 0), 'invitation', v_invite_result);
  END IF;
  IF COALESCE(v_tx.status, 'pending') NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'status', v_tx.status);
  END IF;
  IF v_tx.package_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_package');
  END IF;

  SELECT id, price_usd, coins_amount, COALESCE(bonus_coins, 0) AS bonus_coins,
         (coins_amount + COALESCE(bonus_coins, 0)) AS total_coins
    INTO v_pkg FROM public.coin_packages
   WHERE id = v_tx.package_id AND is_active = true LIMIT 1;
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

  INSERT INTO public.coin_transactions (user_id, transaction_type, amount, balance_before, balance_after, description, reference_id)
  VALUES (v_tx.user_id, 'recharge', v_credit_amount, v_balance_before, v_balance_before + v_credit_amount,
          'Admin completed payment ' || v_tx.id::text, v_payment_ref);

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + v_credit_amount,
         total_recharged = COALESCE(total_recharged, 0) + COALESCE(v_pkg.price_usd, 0)
   WHERE id = v_tx.user_id;

  UPDATE public.payment_transactions SET status = 'completed', updated_at = now() WHERE id = _transaction_id;

  v_invite_result := public.qualify_invitation_after_purchase(v_tx.user_id, COALESCE(v_tx.amount_usd, v_pkg.price_usd), v_credit_amount, 'payment_transaction', v_tx.id::text);

  v_balance_after := v_balance_before + v_credit_amount;
  RETURN jsonb_build_object('success', true, 'creditedCoins', v_credit_amount, 'newBalance', v_balance_after, 'invitation', v_invite_result);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_complete_payment_transaction(uuid) TO service_role;

-- 4) Google Play verified purchase now qualifies invitation after DB credit succeeds.
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

  INSERT INTO public.payment_reconciliation_log (
    event_type, gateway, user_id, order_id, transaction_id, amount_coins,
    amount_usd, balance_before, balance_after, metadata
  ) VALUES (
    'credit_success', 'google_play', p_user_id,
    COALESCE(v_order_id, p_purchase_token), p_purchase_token,
    v_pkg.total_coins, v_pkg.price_usd, v_balance_before, v_balance_after,
    jsonb_build_object('product_id', v_requested_product, 'canonical_product_id', v_pkg.product_id, 'package_id', v_pkg.id, 'google_order_id', v_order_id, 'google_payload', p_google_payload)
  );

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

-- 5) safe_credit_diamonds users (SwiftPay/local gateway) now qualify invitation when amount_usd is known.
CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_gateway text DEFAULT NULL::text,
  p_order_id text DEFAULT NULL::text,
  p_transaction_id text DEFAULT NULL::text,
  p_amount_usd numeric DEFAULT NULL::numeric,
  p_metadata jsonb DEFAULT NULL::jsonb
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
  _is_service boolean;
  _bonus_result jsonb;
  _invite_result jsonb;
BEGIN
  _is_service := COALESCE(auth.role(), '') = 'service_role';
  IF NOT _is_service AND NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: safe_credit_diamonds requires service or admin context';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  _payment_ref := COALESCE(p_order_id, '') || ':' || COALESCE(p_transaction_id, '');
  IF _payment_ref = ':' THEN
    _payment_ref := COALESCE(p_gateway,'unknown') || ':' || p_user_id::text || ':' || p_amount::text || ':' || extract(epoch from clock_timestamp())::text;
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  BEGIN
    INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
    VALUES (p_user_id, p_amount, 'recharge', p_gateway, _payment_ref, 'completed', 'order:' || COALESCE(p_order_id, 'N/A') || ' txn:' || COALESCE(p_transaction_id, 'N/A'))
    RETURNING id INTO _inserted_id;
  EXCEPTION WHEN unique_violation THEN
    _invite_result := public.qualify_invitation_after_purchase(p_user_id, p_amount_usd, p_amount, p_gateway, _payment_ref);
    RETURN json_build_object('success', true, 'already_credited', true, 'payment_reference', _payment_ref, 'invitation', _invite_result);
  END;
  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + p_amount,
         total_recharged = COALESCE(total_recharged, 0) + p_amount
   WHERE id = p_user_id
   RETURNING coins INTO _new_balance;
  IF NOT FOUND THEN
    DELETE FROM public.coin_transactions WHERE id = _inserted_id;
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  BEGIN
    INSERT INTO public.payment_reconciliation_log (user_id, gateway, order_id, transaction_id, amount_coins, amount_usd, metadata, status)
    VALUES (p_user_id, p_gateway, p_order_id, p_transaction_id, p_amount, p_amount_usd, p_metadata, 'credited');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  BEGIN
    _bonus_result := public._apply_recharge_bonuses_internal(p_user_id, p_amount, _inserted_id::text);
  EXCEPTION WHEN OTHERS THEN
    _bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  _invite_result := public.qualify_invitation_after_purchase(p_user_id, p_amount_usd, p_amount, p_gateway, _payment_ref);

  RETURN json_build_object('success', true, 'new_balance', _new_balance, 'amount_credited', p_amount, 'payment_reference', _payment_ref, 'bonuses', _bonus_result, 'invitation', _invite_result);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.safe_credit_diamonds(uuid, integer, text, text, text, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.safe_credit_diamonds(uuid, integer, text, text, text, numeric, jsonb) TO service_role;

-- 6) Helper top-up approval now qualifies invitation from helper_orders.amount_usd.
CREATE OR REPLACE FUNCTION public.process_helper_order_secure(
  _order_id uuid, _action text, _notes text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.helper_orders%ROWTYPE;
  v_helper_wallet numeric;
  v_helper_user_id uuid;
  v_agency_id uuid;
  v_agency_bal numeric;
  v_remaining numeric;
  v_wallet_deducted numeric := 0;
  v_agency_deducted numeric := 0;
  v_new_user_balance bigint;
  v_is_admin boolean := public.is_active_admin_session();
  v_bonus_result jsonb;
  v_invite_result jsonb;
BEGIN
  IF lower(coalesce(_action, '')) NOT IN ('complete', 'approve', 'cancel', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;

  SELECT * INTO v_order FROM public.helper_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  SELECT wallet_balance, user_id INTO v_helper_wallet, v_helper_user_id FROM public.topup_helpers WHERE id = v_order.helper_id FOR UPDATE;
  IF v_helper_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'helper_not_found');
  END IF;

  IF NOT (v_is_admin OR v_helper_user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF lower(_action) IN ('cancel', 'reject') THEN
    IF v_order.status = 'completed' THEN
      RETURN jsonb_build_object('success', false, 'error', 'cannot_cancel_completed');
    END IF;
    UPDATE public.helper_orders
       SET status = 'cancelled', processed_at = now(), helper_notes = COALESCE(_notes, helper_notes),
           payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('cancelled_by', CASE WHEN v_is_admin THEN 'admin' ELSE 'helper' END, 'cancelled_at', now())
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', true, 'status', 'cancelled');
  END IF;

  IF v_order.status = 'gateway_pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'gateway_pending_requires_ipn');
  END IF;

  IF v_order.status = 'completed' THEN
    SELECT COALESCE(coins, 0) INTO v_new_user_balance FROM public.profiles WHERE id = v_order.user_id;
    v_invite_result := public.qualify_invitation_after_purchase(v_order.user_id, v_order.amount_usd, v_order.coin_amount, 'helper_order', v_order.id::text);
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'newBalance', COALESCE(v_new_user_balance, 0), 'invitation', v_invite_result);
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status', 'status', v_order.status);
  END IF;

  IF COALESCE(v_order.coin_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_coin_amount');
  END IF;

  v_remaining := v_order.coin_amount;

  IF COALESCE(v_helper_wallet, 0) > 0 THEN
    IF v_helper_wallet >= v_remaining THEN
      v_wallet_deducted := v_remaining;
      v_remaining := 0;
    ELSE
      v_wallet_deducted := v_helper_wallet;
      v_remaining := v_remaining - v_helper_wallet;
    END IF;
    UPDATE public.topup_helpers SET wallet_balance = wallet_balance - v_wallet_deducted, updated_at = now() WHERE id = v_order.helper_id;
  END IF;

  IF v_remaining > 0 THEN
    SELECT id, diamond_balance INTO v_agency_id, v_agency_bal FROM public.agencies WHERE owner_id = v_helper_user_id FOR UPDATE;
    IF v_agency_id IS NOT NULL AND COALESCE(v_agency_bal, 0) >= v_remaining THEN
      v_agency_deducted := v_remaining;
      v_remaining := 0;
      UPDATE public.agencies SET diamond_balance = diamond_balance - v_agency_deducted, updated_at = now() WHERE id = v_agency_id;
    END IF;
  END IF;

  IF v_remaining > 0 THEN
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers SET wallet_balance = wallet_balance + v_wallet_deducted WHERE id = v_order.helper_id;
    END IF;
    UPDATE public.helper_orders
       SET status = 'failed', helper_notes = COALESCE(_notes, helper_notes),
           payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('failure_reason', 'helper_insufficient_balance', 'wallet_balance', COALESCE(v_helper_wallet, 0), 'agency_balance', COALESCE(v_agency_bal, 0))
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'helper_insufficient_balance');
  END IF;

  UPDATE public.topup_helpers SET total_sold = COALESCE(total_sold, 0) + v_order.coin_amount, updated_at = now() WHERE id = v_order.helper_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + v_order.coin_amount,
         total_recharged = COALESCE(total_recharged, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_order.user_id
   RETURNING COALESCE(coins, 0) INTO v_new_user_balance;

  IF NOT FOUND THEN
    IF v_wallet_deducted > 0 THEN UPDATE public.topup_helpers SET wallet_balance = wallet_balance + v_wallet_deducted WHERE id = v_order.helper_id; END IF;
    IF v_agency_deducted > 0 AND v_agency_id IS NOT NULL THEN UPDATE public.agencies SET diamond_balance = diamond_balance + v_agency_deducted WHERE id = v_agency_id; END IF;
    UPDATE public.helper_orders SET status = 'failed', payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('failure_reason', 'buyer_profile_not_found') WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'buyer_profile_not_found');
  END IF;

  UPDATE public.helper_orders
     SET status = 'completed', processed_at = now(), helper_notes = COALESCE(_notes, helper_notes),
         payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('completed_by', CASE WHEN v_is_admin THEN 'admin' ELSE 'helper' END, 'wallet_deducted', v_wallet_deducted, 'agency_deducted', v_agency_deducted, 'balance_after', v_new_user_balance)
   WHERE id = _order_id;

  BEGIN
    INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
    VALUES (v_helper_user_id, v_order.user_id, v_order.coin_amount, 'helper_topup', 'completed', 'Manual helper top-up. Order: ' || _order_id::text);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    v_bonus_result := public._apply_recharge_bonuses_internal(v_order.user_id, v_order.coin_amount::integer, _order_id::text);
  EXCEPTION WHEN OTHERS THEN
    v_bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  v_invite_result := public.qualify_invitation_after_purchase(v_order.user_id, v_order.amount_usd, v_order.coin_amount, 'helper_order', v_order.id::text);

  RETURN jsonb_build_object('success', true, 'status', 'completed', 'creditedCoins', v_order.coin_amount, 'newBalance', v_new_user_balance, 'walletDeducted', v_wallet_deducted, 'agencyDeducted', v_agency_deducted, 'bonuses', v_bonus_result, 'invitation', v_invite_result);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_helper_order_secure(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_helper_order_secure(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_helper_order_secure(uuid, text, text) TO service_role;
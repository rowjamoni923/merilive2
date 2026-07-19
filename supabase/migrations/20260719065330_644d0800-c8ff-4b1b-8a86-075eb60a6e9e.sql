
-- ============================================================
-- MeriLive DU-2 BATCH 4 — Retarget 29 legacy spend writers
-- from profiles.coins  ->  profiles.diamonds
--
-- Rules honoured (zero business-logic change):
--  * ONLY profiles.coins read/write is rewritten to profiles.diamonds
--  * coin_transactions.coins_amount, coin_transfers, coin_packages.coins_amount,
--    helper_orders.coin_amount, recharge_transactions.coins_amount,
--    agencies.diamond_balance, topup_helpers.wallet_balance, beans -> ALL UNTOUCHED
--  * DU-2A mirror trigger (trg_du2_sync_spend_wallet) still installed -> any
--    legacy SELECT coins path still reads correct value during soak
--  * Amounts, %, ordering, notifications, admin_logs, guards, error strings -> IDENTICAL
--  * After this batch, zero function writes profiles.coins directly -> DU-5A safe.
-- ============================================================

-- 1) _do_reverse_auto_action
CREATE OR REPLACE FUNCTION public._do_reverse_auto_action(_action_type text, _action_id uuid, _reason text, _admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_amount bigint; v_user uuid; v_agency uuid; v_helper uuid;
  v_existing timestamptz; v_diamonds_credited boolean; v_diamond_amt numeric;
BEGIN
  PERFORM set_config('app.bypass_profile_protection','true',true);

  IF _action_type = 'recharge' THEN
    SELECT reversed_at, user_id, coins_amount
      INTO v_existing, v_user, v_amount
      FROM public.recharge_transactions
     WHERE id = _action_id FOR UPDATE;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Recharge not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    UPDATE public.profiles SET diamonds = GREATEST(0, COALESCE(diamonds,0) - v_amount) WHERE id = v_user;
    UPDATE public.recharge_transactions
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason,
           status = 'reversed', updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_type = 'agency_withdrawal' THEN
    SELECT reversed_at, agency_id, amount
      INTO v_existing, v_agency, v_amount
      FROM public.agency_withdrawals
     WHERE id = _action_id FOR UPDATE;
    IF v_agency IS NULL THEN RETURN jsonb_build_object('success',false,'error','Withdrawal not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    UPDATE public.agencies SET beans_balance = COALESCE(beans_balance,0) + v_amount WHERE id = v_agency;
    UPDATE public.agency_withdrawals
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason,
           status = 'reversed', updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_type = 'helper_withdrawal' THEN
    SELECT reversed_at, helper_id, beans_amount, helper_diamonds_credited, diamond_reward
      INTO v_existing, v_helper, v_amount, v_diamonds_credited, v_diamond_amt
      FROM public.helper_withdrawal_requests
     WHERE id = _action_id FOR UPDATE;
    IF v_helper IS NULL THEN RETURN jsonb_build_object('success',false,'error','Helper withdrawal not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    UPDATE public.profiles SET beans = COALESCE(beans,0) + v_amount WHERE id = v_helper;
    IF COALESCE(v_diamonds_credited,false) AND COALESCE(v_diamond_amt,0) > 0 THEN
      UPDATE public.profiles SET diamonds = GREATEST(0, COALESCE(diamonds,0) - v_diamond_amt::bigint) WHERE id = v_helper;
    END IF;
    UPDATE public.helper_withdrawal_requests
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason,
           status = 'reversed', helper_diamonds_credited = false, updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_type = 'payroll' THEN
    SELECT reversed_at, user_id, beans_amount
      INTO v_existing, v_user, v_amount
      FROM public.payroll_requests
     WHERE id = _action_id FOR UPDATE;
    IF v_user IS NULL THEN RETURN jsonb_build_object('success',false,'error','Payroll not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    UPDATE public.profiles SET beans = COALESCE(beans,0) + v_amount WHERE id = v_user;
    UPDATE public.payroll_requests
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason,
           status = 'reversed', updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_type = 'commission' THEN
    SELECT reversed_at, agency_id, commission_amount
      INTO v_existing, v_agency, v_amount
      FROM public.agency_commission_history
     WHERE id = _action_id FOR UPDATE;
    IF v_agency IS NULL THEN RETURN jsonb_build_object('success',false,'error','Commission not found'); END IF;
    IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('success',false,'error','Already reversed'); END IF;
    UPDATE public.agencies SET beans_balance = GREATEST(0, COALESCE(beans_balance,0) - v_amount) WHERE id = v_agency;
    UPDATE public.agency_commission_history
       SET reversed_at = now(), reversed_by = _admin_id, reversal_reason = _reason
     WHERE id = _action_id;
  ELSE
    RETURN jsonb_build_object('success',false,'error','Unknown action_type: '||_action_type);
  END IF;

  RETURN jsonb_build_object('success',true,'action_type',_action_type,'action_id',_action_id,'amount',v_amount);
END $function$;

-- 2) _internal_add_coins
CREATE OR REPLACE FUNCTION public._internal_add_coins(_user_id uuid, _amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: _internal_add_coins is internal only';
  END IF;
  IF _amount <= 0 THEN RETURN; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _amount WHERE id = _user_id;
END;
$function$;

-- 3) add_coins
CREATE OR REPLACE FUNCTION public.add_coins(p_user_id uuid, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result_balance bigint;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET diamonds = COALESCE(diamonds,0) + p_amount WHERE id = p_user_id RETURNING diamonds INTO result_balance;
  IF result_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
END;
$function$;

-- 4) add_coins_to_user
CREATE OR REPLACE FUNCTION public.add_coins_to_user(_user_id uuid, _amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR COALESCE(auth.role(), '') = 'service_role';
  v_admin_id uuid := public.current_admin_id_from_header();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF _amount > 10000000 THEN
    RAISE EXCEPTION 'Amount too large';
  END IF;

  IF NOT v_is_service
     AND v_admin_id IS NULL
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add coins';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET diamonds = COALESCE(diamonds, 0) + _amount,
         updated_at = now()
   WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_id, target_type, details)
    VALUES (
      v_admin_id,
      'add_coins',
      _user_id,
      'user',
      jsonb_build_object('amount', _amount, 'action', 'admin_coin_add')
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$function$;

-- 5) admin_add_user_coins
CREATE OR REPLACE FUNCTION public.admin_add_user_coins(_user_id uuid, _amount bigint, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new bigint;
  v_role text := public.current_effective_admin_role();
  v_pending uuid;
BEGIN
  IF NOT public.admin_has_any_section_permission(ARRAY['manual-topup','topup-system','finance-hub','user-management'], true) THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  IF _amount IS NULL OR _amount = 0 OR abs(_amount) > 10000000 THEN
    RETURN jsonb_build_object('success',false,'error','Invalid amount');
  END IF;
  IF v_role = 'sub_admin' THEN
    v_pending := public._enqueue_admin_pending_action('add_diamonds', _user_id, NULL, jsonb_build_object('user_id', _user_id, 'amount', _amount), _note);
    RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
  END IF;
  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE public.profiles SET diamonds = GREATEST(COALESCE(diamonds,0)+_amount,0), updated_at = now()
   WHERE id = _user_id RETURNING diamonds INTO v_new;
  IF v_new IS NULL THEN RETURN jsonb_build_object('success',false,'error','User not found'); END IF;
  RETURN jsonb_build_object('success',true,'new_balance',v_new,'note',_note);
END;
$function$;

-- 6) admin_complete_payment_transaction
CREATE OR REPLACE FUNCTION public.admin_complete_payment_transaction(_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT COALESCE(diamonds, 0) INTO v_balance_after FROM public.profiles WHERE id = v_tx.user_id;
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

  SELECT COALESCE(diamonds, 0) INTO v_balance_before FROM public.profiles WHERE id = v_tx.user_id FOR UPDATE;
  IF v_balance_before IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_payment_ref := 'payment_tx:' || v_tx.id::text;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
  VALUES (v_tx.user_id, v_credit_amount, 'recharge', COALESCE(v_tx.payment_method, 'admin_payment'), v_payment_ref, 'completed', 'Admin completed payment ' || v_tx.id::text);

  UPDATE public.profiles
     SET diamonds = COALESCE(diamonds, 0) + v_credit_amount,
         total_recharged = COALESCE(total_recharged, 0) + COALESCE(v_pkg.price_usd, 0)
   WHERE id = v_tx.user_id;

  UPDATE public.payment_transactions
     SET status = 'completed', updated_at = now()
   WHERE id = _transaction_id;

  v_invite_result := public.qualify_invitation_after_purchase(v_tx.user_id, COALESCE(v_tx.amount_usd, v_pkg.price_usd), v_credit_amount, 'payment_transaction', v_tx.id::text);
  v_balance_after := v_balance_before + v_credit_amount;

  RETURN jsonb_build_object('success', true, 'creditedCoins', v_credit_amount, 'newBalance', v_balance_after, 'invitation', v_invite_result);
END;
$function$;

-- 7) admin_recover_purchase_credit
CREATE OR REPLACE FUNCTION public.admin_recover_purchase_credit(p_user_id uuid, p_coin_amount integer, p_google_order_id text DEFAULT NULL::text, p_product_id text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_admin_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg record;
  v_profile record;
  v_balance_before bigint := 0;
  v_balance_after bigint := 0;
  v_diamonds_after bigint := 0;
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

  SELECT id, COALESCE(diamonds, 0) AS diamonds
    INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF v_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_balance_before := v_profile.diamonds;
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
     SET diamonds = COALESCE(diamonds, 0) + v_credit_coins,
         updated_at = now()
   WHERE id = p_user_id
   RETURNING COALESCE(diamonds, 0), COALESCE(diamonds, 0)
      INTO v_balance_after, v_diamonds_after;

  BEGIN
    INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
    VALUES (p_user_id, LEAST(v_credit_coins, 2147483000), 'recharge', 'admin_manual_recovery', v_payment_ref, 'completed', v_notes);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    v_bonus_result := public._apply_recharge_bonuses_internal(p_user_id, v_credit_coins, v_recharge_id::text);
    SELECT COALESCE(diamonds, 0), COALESCE(diamonds, 0)
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
$function$;

-- 8) agency_send_diamonds_to_user
CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_user(_agency_id uuid, _receiver_id uuid, _amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_agency_owner_id uuid;
  v_current_balance bigint;
  v_new_user_balance bigint;
  v_agency_name text;
  v_payment_ref text;
BEGIN
  v_caller := auth.uid();
  PERFORM set_config('app.calling_function', 'agency_send_diamonds_to_user', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);

  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF v_caller = _receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  SELECT owner_id, diamond_balance, name INTO v_agency_owner_id, v_current_balance, v_agency_name
  FROM public.agencies
  WHERE id = _agency_id AND COALESCE(is_active, true) = true
  FOR UPDATE;

  IF v_agency_owner_id IS NULL OR v_agency_owner_id <> v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not agency owner');
  END IF;

  v_current_balance := COALESCE(v_current_balance, 0);
  IF _amount > v_current_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance');
  END IF;

  UPDATE public.agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) - _amount,
      updated_at = now()
  WHERE id = _agency_id;

  UPDATE public.profiles
  SET diamonds = COALESCE(diamonds, 0) + _amount
  WHERE id = _receiver_id
  RETURNING diamonds INTO v_new_user_balance;

  IF v_new_user_balance IS NULL THEN
    RAISE EXCEPTION 'Receiver not found';
  END IF;

  v_payment_ref := 'agency_transfer:' || _agency_id::text || ':' || gen_random_uuid()::text;

  INSERT INTO public.coin_transactions(user_id, coins_amount, transaction_type, status, notes, payment_reference)
  VALUES (
    _receiver_id, _amount, 'agency_transfer_in', 'completed',
    'Agency transfer credited to user top-up balance from ' || COALESCE(v_agency_name, 'Agency'),
    v_payment_ref
  );

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (
    _receiver_id,
    'coins_received',
    'Top-up Balance Received',
    _amount::text || ' diamonds received from ' || COALESCE(v_agency_name, 'Agency'),
    jsonb_build_object('agency_id', _agency_id, 'agency_name', v_agency_name, 'amount', _amount, 'balance_bucket', 'topup_balance', 'action_url', '/recharge-history'),
    false,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_agency_balance', v_current_balance - _amount,
    'new_receiver_coins', v_new_user_balance,
    'destination', 'user_topup_balance'
  );
END;
$function$;

-- 9) approve_rating_reward  (only fallback branch uses profiles.coins -> retarget diamonds)
CREATE OR REPLACE FUNCTION public.approve_rating_reward(p_claim_id uuid, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claim RECORD;
  v_amount bigint;
  v_type text;
  v_balance_after bigint;
BEGIN
  IF NOT (public.is_admin(p_admin_id) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_claim
  FROM public.rating_reward_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim not found');
  END IF;

  IF v_claim.status IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyProcessed', true,
      'claim_id', p_claim_id,
      'status', v_claim.status,
      'reward_type', v_claim.reward_type,
      'reward_amount', COALESCE(v_claim.reward_amount, 0)
    );
  END IF;

  IF v_claim.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim is not pending');
  END IF;

  v_type := COALESCE(NULLIF(v_claim.reward_type, ''), 'diamonds');
  v_amount := COALESCE(v_claim.reward_amount, v_claim.reward_coins, 0);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim reward data missing or invalid');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF v_type = 'beans' THEN
    UPDATE public.profiles
    SET beans = COALESCE(beans, 0) + v_amount,
        updated_at = now()
    WHERE id = v_claim.user_id
    RETURNING COALESCE(beans, 0) INTO v_balance_after;
  ELSE
    -- diamonds (canonical) AND legacy 'coins' fallback both credit diamonds now
    UPDATE public.profiles
    SET diamonds = COALESCE(diamonds, 0) + v_amount,
        updated_at = now()
    WHERE id = v_claim.user_id
    RETURNING COALESCE(diamonds, 0) INTO v_balance_after;
    IF v_type = 'coins' THEN
      v_type := 'diamonds';
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  IF v_balance_after IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  UPDATE public.rating_reward_claims
  SET status = 'approved',
      reviewed_by = p_admin_id,
      reviewed_at = now(),
      rejection_reason = NULL,
      reward_type = v_type,
      reward_amount = v_amount
  WHERE id = p_claim_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'status', 'approved',
    'reward_type', v_type,
    'reward_amount', v_amount,
    'new_balance', v_balance_after
  );
END;
$function$;

-- 10) claim_daily_login_reward
CREATE OR REPLACE FUNCTION public.claim_daily_login_reward(_claimed_date date DEFAULT NULL::date, _day_start timestamp with time zone DEFAULT NULL::timestamp with time zone, _day_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _is_host boolean;
  _server_date date;
  _yesterday   date;
  _existing_claim record;
  _last_claim record;
  _next_day int;
  _reward record;
  _coins_to_add int;
  _diamonds_to_add int;
  _total_amount int;
  _primary_type text;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT COALESCE(is_host, false) INTO _is_host
  FROM public.profiles WHERE id = _user_id;
  IF COALESCE(_is_host, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hosts are not eligible for daily rewards');
  END IF;

  _server_date := public.get_task_reset_date();
  _yesterday   := _server_date - INTERVAL '1 day';

  SELECT * INTO _existing_claim
  FROM public.daily_login_claims
  WHERE user_id = _user_id
    AND claimed_date = _server_date
  ORDER BY claimed_at DESC
  LIMIT 1;

  IF _existing_claim IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today');
  END IF;

  SELECT * INTO _last_claim
  FROM public.daily_login_claims
  WHERE user_id = _user_id
  ORDER BY claimed_at DESC
  LIMIT 1;

  IF _last_claim IS NOT NULL AND _last_claim.claimed_date = _yesterday THEN
    _next_day := (COALESCE(_last_claim.day_number, 0) % 7) + 1;
  ELSE
    _next_day := 1;
  END IF;

  SELECT * INTO _reward
  FROM public.daily_login_rewards_config
  WHERE day_number = _next_day AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward config not found');
  END IF;

  _coins_to_add    := COALESCE(_reward.reward_coins, 0);
  _diamonds_to_add := COALESCE(_reward.reward_diamonds, 0);

  IF _coins_to_add = 0 AND _diamonds_to_add = 0 AND COALESCE(_reward.reward_amount, 0) > 0 THEN
    IF COALESCE(_reward.reward_type, 'coins') = 'diamonds' THEN
      _diamonds_to_add := _reward.reward_amount;
    ELSE
      _coins_to_add := _reward.reward_amount;
    END IF;
  END IF;

  _total_amount := _coins_to_add + _diamonds_to_add;
  _primary_type := CASE WHEN _coins_to_add >= _diamonds_to_add THEN 'coins' ELSE 'diamonds' END;

  BEGIN
    INSERT INTO public.daily_login_claims (
      user_id, reward_id, day_number, reward_type, reward_amount, claimed_date
    )
    VALUES (
      _user_id, _reward.id, _next_day, _primary_type, _total_amount, _server_date
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today');
  END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  -- Both legacy "coins" and canonical "diamonds" credit the spend wallet (diamonds)
  IF _coins_to_add > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _coins_to_add WHERE id = _user_id;
  END IF;
  IF _diamonds_to_add > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _diamonds_to_add WHERE id = _user_id;
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  INSERT INTO public.user_login_streaks (user_id, current_streak, last_login_date, total_logins)
  VALUES (_user_id, _next_day, _server_date, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET current_streak = _next_day,
      last_login_date = _server_date,
      total_logins = COALESCE(public.user_login_streaks.total_logins, 0) + 1;

  RETURN jsonb_build_object(
    'success', true,
    'day', _next_day,
    'reward_type', _primary_type,
    'reward_amount', _total_amount,
    'coins', _coins_to_add,
    'diamonds', _diamonds_to_add,
    'bonus_label', _reward.bonus_label
  );
END;
$function$;

-- 11) claim_invitation_reward
CREATE OR REPLACE FUNCTION public.claim_invitation_reward(_tier_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _tier RECORD;
  _invite_count int;
  _already_claimed boolean;
  _coins int;
  _beans int;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO _tier
  FROM public.invitation_reward_tiers
  WHERE id = _tier_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tier not found or inactive');
  END IF;

  _coins := COALESCE(_tier.reward_coins, 0);
  _beans := COALESCE(_tier.reward_beans, 0);

  IF _coins <= 0 AND _beans <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No reward configured for this tier');
  END IF;

  SELECT COUNT(*)::int INTO _invite_count
  FROM public.user_invitations
  WHERE inviter_id = _user_id AND status = 'verified';

  IF _invite_count < COALESCE(_tier.min_invites, 0) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Need at least ' || _tier.min_invites || ' verified invites',
      'current_invites', _invite_count
    );
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.invitation_reward_claims
    WHERE claimed_by = _user_id AND invitation_id = _tier_id
  ) INTO _already_claimed;

  IF _already_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed this tier');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _coins > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _coins WHERE id = _user_id;
  END IF;

  IF _beans > 0 THEN
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + _beans WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  INSERT INTO public.invitation_reward_claims (
    claimed_by, invitation_id, reward_type, reward_amount
  ) VALUES (
    _user_id, _tier_id, 'tier_reward', _coins + _beans
  );

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    _user_id,
    'invitation_reward',
    '🎁 Invitation Reward Claimed!',
    'You received ' ||
      CASE
        WHEN _coins > 0 AND _beans > 0 THEN _coins || ' diamonds and ' || _beans || ' beans'
        WHEN _coins > 0 THEN _coins || ' diamonds'
        ELSE _beans || ' beans'
      END || ' from ' || _tier.tier_name || ' tier!',
    jsonb_build_object('tier_id', _tier_id, 'tier_name', _tier.tier_name, 'coins', _coins, 'beans', _beans)
  );

  RETURN jsonb_build_object(
    'success', true,
    'tier_name', _tier.tier_name,
    'coins', _coins,
    'beans', _beans
  );
END;
$function$;

-- 12) claim_new_host_live_bonus
CREATE OR REPLACE FUNCTION public.claim_new_host_live_bonus()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _host_id uuid;
  _profile RECORD;
  _stream_count int;
  _admin_bonus int := 0;
BEGIN
  _host_id := auth.uid();
  IF _host_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _host_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF _profile.is_host IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a host');
  END IF;
  IF COALESCE(_profile.new_host_bonus_claimed, false) = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bonus already claimed');
  END IF;

  SELECT COUNT(*) INTO _stream_count
  FROM public.live_streams
  WHERE host_id = _host_id AND ended_at IS NOT NULL;
  IF _stream_count < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Must complete at least 1 live stream');
  END IF;

  SELECT COALESCE(SUM(bonus_amount), 0)::int INTO _admin_bonus
  FROM public.new_host_live_bonus_settings
  WHERE is_active = true AND day_number = 1;

  IF _admin_bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bonus is not configured by admin');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET diamonds = COALESCE(diamonds, 0) + _admin_bonus,
         new_host_bonus_claimed = true,
         updated_at = now()
   WHERE id = _host_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    _host_id, 'bonus',
    '🎉 New Host Bonus!',
    'Congratulations! You received ' || _admin_bonus || ' diamonds as your new host bonus.',
    jsonb_build_object('bonus_coins', _admin_bonus, 'type', 'new_host_bonus')
  );

  RETURN jsonb_build_object('success', true, 'bonus_coins', _admin_bonus);
END;
$function$;

-- 13) claim_parcel_reward
CREATE OR REPLACE FUNCTION public.claim_parcel_reward(p_parcel_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _parcel RECORD;
  _template RECORD;
  _reward_type text;
  _reward_amount integer;
  _parcel_name text;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO _parcel FROM public.user_parcels 
  WHERE id = p_parcel_id AND user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel not found');
  END IF;

  IF _parcel.status NOT IN ('unlocked') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel not ready (' || _parcel.status || ')');
  END IF;

  IF _parcel.expires_at IS NOT NULL AND _parcel.expires_at < now() THEN
    UPDATE public.user_parcels SET status = 'expired' WHERE id = p_parcel_id;
    RETURN jsonb_build_object('success', false, 'error', 'Parcel expired');
  END IF;

  _reward_type := _parcel.actual_reward_type;
  _reward_amount := _parcel.actual_reward_amount;

  SELECT name, reward_type, reward_amount INTO _template
  FROM public.parcel_templates WHERE id = _parcel.template_id;

  _parcel_name := COALESCE(_template.name, 'Gift Parcel');
  IF _reward_type IS NULL OR _reward_amount IS NULL OR _reward_amount = 0 THEN
    _reward_type := COALESCE(_reward_type, _template.reward_type, 'coins');
    _reward_amount := COALESCE(NULLIF(_reward_amount, 0), _template.reward_amount, 0);
  END IF;

  IF _reward_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No reward configured');
  END IF;

  UPDATE public.user_parcels 
  SET status = 'opened', opened_at = now(), claimed_at = now(),
      actual_reward_type = _reward_type, actual_reward_amount = _reward_amount
  WHERE id = p_parcel_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- 'coins' and 'diamonds' both credit the canonical spend wallet (diamonds)
  IF _reward_type IN ('coins', 'diamonds') THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _reward_amount WHERE id = _user_id;
  ELSIF _reward_type = 'beans' THEN
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + _reward_amount WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'reward_type', _reward_type,
    'reward_amount', _reward_amount,
    'parcel_name', _parcel_name
  );
END;
$function$;

-- 14) claim_task_reward (no-arg overload, unchanged body)
CREATE OR REPLACE FUNCTION public.claim_task_reward(_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated', 'beans', 0, 'coins', 0);
  END IF;

  RETURN public.claim_task_reward(_user_id, _task_id, NULL);
END;
$function$;

-- 15) claim_task_reward (three-arg overload)
CREATE OR REPLACE FUNCTION public.claim_task_reward(_user_id uuid, _task_id uuid, _task_date text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _task RECORD;
  _progress RECORD;
  _expected_key text;
  _claim_count int;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden', 'beans', 0, 'coins', 0);
  END IF;

  SELECT * INTO _task FROM public.daily_tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found', 'beans', 0, 'coins', 0);
  END IF;

  _expected_key := CASE COALESCE(_task.mission_bucket, 'daily')
    WHEN 'weekly' THEN to_char(public.get_task_week_reset_date(), 'YYYY-MM-DD')
    WHEN 'achievement' THEN '1970-01-01'
    ELSE to_char(public.get_task_reset_date(), 'YYYY-MM-DD')
  END;

  IF _task_date IS NOT NULL AND length(trim(_task_date)) > 0 AND trim(_task_date) <> _expected_key THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task period mismatch', 'beans', 0, 'coins', 0);
  END IF;

  SELECT * INTO _progress
  FROM public.user_task_progress
  WHERE user_id = _user_id AND task_id = _task_id AND reset_date = _expected_key::date
  FOR UPDATE;

  IF NOT FOUND OR NOT COALESCE(_progress.is_completed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed', 'beans', 0, 'coins', 0);
  END IF;

  IF COALESCE(_progress.reward_claimed, false) THEN
    RETURN jsonb_build_object(
      'success', true, 'already_claimed', true,
      'beans', 0, 'coins', 0, 'beans_earned', 0, 'coins_earned', 0
    );
  END IF;

  UPDATE public.user_task_progress
  SET reward_claimed = true,
      claimed_at = COALESCE(claimed_at, now()),
      updated_at = now()
  WHERE user_id = _user_id
    AND task_id = _task_id
    AND reset_date = _expected_key::date
    AND COALESCE(reward_claimed, false) = false;
  GET DIAGNOSTICS _claim_count = ROW_COUNT;

  IF _claim_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'already_claimed', true,
      'beans', 0, 'coins', 0, 'beans_earned', 0, 'coins_earned', 0
    );
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  IF COALESCE(_task.reward_beans, 0) > 0 THEN
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + _task.reward_beans WHERE id = _user_id;
  END IF;
  IF COALESCE(_task.reward_coins, 0) > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _task.reward_coins WHERE id = _user_id;
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'already_claimed', false,
    'beans', COALESCE(_task.reward_beans, 0),
    'coins', COALESCE(_task.reward_coins, 0),
    'beans_earned', COALESCE(_task.reward_beans, 0),
    'coins_earned', COALESCE(_task.reward_coins, 0)
  );
END;
$function$;

-- 16) claim_vip_daily_reward
CREATE OR REPLACE FUNCTION public.claim_vip_daily_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id UUID := auth.uid();
  _today DATE := CURRENT_DATE;
  _vip_tier RECORD;
  _noble_card RECORD;
  _vip_diamonds INTEGER := 0;
  _noble_diamonds INTEGER := 0;
  _total INTEGER := 0;
  _claimed_sources TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT vt.id, vt.daily_free_diamonds, vt.tier_name INTO _vip_tier
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now())
    AND vt.daily_free_diamonds > 0
  ORDER BY vt.tier_level DESC
  LIMIT 1;

  IF _vip_tier.id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.vip_daily_rewards_log (user_id, claim_date, source_type, source_id, diamonds_awarded)
      VALUES (_user_id, _today, 'vip_tier', _vip_tier.id, _vip_tier.daily_free_diamonds);
      _vip_diamonds := _vip_tier.daily_free_diamonds;
      _claimed_sources := array_append(_claimed_sources, 'vip_tier:' || _vip_tier.tier_name);
    EXCEPTION WHEN unique_violation THEN
      _vip_diamonds := 0;
    END;
  END IF;

  SELECT nc.id, nc.daily_free_diamonds, nc.rank_name INTO _noble_card
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _user_id
    AND uns.is_active = true
    AND uns.expires_at > now()
    AND nc.daily_free_diamonds > 0
  ORDER BY nc.rank_order DESC
  LIMIT 1;

  IF _noble_card.id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.vip_daily_rewards_log (user_id, claim_date, source_type, source_id, diamonds_awarded)
      VALUES (_user_id, _today, 'noble_card', _noble_card.id, _noble_card.daily_free_diamonds);
      _noble_diamonds := _noble_card.daily_free_diamonds;
      _claimed_sources := array_append(_claimed_sources, 'noble_card:' || _noble_card.rank_name);
    EXCEPTION WHEN unique_violation THEN
      _noble_diamonds := 0;
    END;
  END IF;

  _total := _vip_diamonds + _noble_diamonds;

  IF _total > 0 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
    SET diamonds = COALESCE(diamonds, 0) + _total, updated_at = now()
    WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_diamonds_awarded', _total,
    'vip_diamonds', _vip_diamonds,
    'noble_diamonds', _noble_diamonds,
    'sources', _claimed_sources,
    'already_claimed', (_vip_tier.id IS NOT NULL OR _noble_card.id IS NOT NULL) AND _total = 0
  );
END;
$function$;

-- 17) claim_weekly_login_reward
CREATE OR REPLACE FUNCTION public.claim_weekly_login_reward()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_week TEXT;
  v_cfg RECORD;
  v_already BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  v_week := to_char((now() AT TIME ZONE 'Asia/Dhaka')::date, 'IYYY"-W"IW');

  SELECT * INTO v_cfg
    FROM public.weekly_login_rewards_config
   WHERE is_active = true
   ORDER BY updated_at DESC
   LIMIT 1;

  IF v_cfg IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_configured');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.weekly_login_claims
     WHERE user_id = v_uid AND week_label = v_week
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed', 'week_label', v_week);
  END IF;

  BEGIN
    INSERT INTO public.weekly_login_claims (user_id, week_label, reward_type, reward_amount)
    VALUES (v_uid, v_week, v_cfg.reward_type, v_cfg.reward_amount);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed', 'week_label', v_week);
  END;

  -- 'coins' and 'diamonds' both credit canonical spend wallet (diamonds)
  IF v_cfg.reward_type IN ('coins', 'diamonds') THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds,0) + v_cfg.reward_amount WHERE id = v_uid;
  ELSIF v_cfg.reward_type = 'beans' THEN
    UPDATE public.profiles SET beans = COALESCE(beans,0) + v_cfg.reward_amount WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'week_label', v_week,
    'reward_type', v_cfg.reward_type,
    'reward_amount', v_cfg.reward_amount
  );
END;
$function$;

-- 18) complete_gateway_helper_topup
CREATE OR REPLACE FUNCTION public.complete_gateway_helper_topup(p_order_id uuid, p_gateway text, p_transaction_id text, p_validation_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_order public.helper_orders%ROWTYPE;
  v_helper record;
  v_agency_id uuid;
  v_agency_bal numeric := 0;
  v_remaining numeric := 0;
  v_wallet_deducted numeric := 0;
  v_agency_deducted numeric := 0;
  v_balance_before bigint := 0;
  v_balance_after bigint := 0;
  v_payment_ref text;
  v_coin_txn_id uuid;
  v_gateway text := left(COALESCE(NULLIF(trim(p_gateway), ''), 'local_gateway'), 80);
  v_txn text := left(COALESCE(NULLIF(trim(p_transaction_id), ''), ''), 200);
BEGIN
  IF NOT (v_is_service OR public.is_admin(auth.uid()) OR public.is_active_admin_session()) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_order_id');
  END IF;
  IF v_txn = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_transaction_id');
  END IF;

  SELECT * INTO v_order
    FROM public.helper_orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_credited', true, 'order_id', p_order_id, 'coins_credited', COALESCE(v_order.coin_amount, 0));
  END IF;

  IF v_order.status <> 'gateway_pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_gateway_pending', 'status', v_order.status);
  END IF;

  IF v_order.user_id IS NULL OR v_order.helper_id IS NULL OR COALESCE(v_order.coin_amount, 0) <= 0 THEN
    PERFORM set_config('app.bypass_helper_order_guard', 'true', true);
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object('failure_reason', 'invalid_gateway_order', 'failed_at', now())
     WHERE id = p_order_id;
    RETURN jsonb_build_object('success', false, 'error', 'invalid_gateway_order');
  END IF;

  SELECT id, user_id, wallet_balance, is_active, is_verified, trader_level, payroll_enabled
    INTO v_helper
    FROM public.topup_helpers
   WHERE id = v_order.helper_id
   FOR UPDATE;

  IF NOT FOUND
     OR v_helper.is_active IS NOT TRUE
     OR v_helper.is_verified IS NOT TRUE
     OR v_helper.trader_level <> 5
     OR v_helper.payroll_enabled IS NOT TRUE THEN
    PERFORM set_config('app.bypass_helper_order_guard', 'true', true);
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object('failure_reason', 'helper_not_eligible_for_gateway_credit', 'failed_at', now())
     WHERE id = p_order_id;
    RETURN jsonb_build_object('success', false, 'error', 'helper_not_eligible_for_gateway_credit');
  END IF;

  v_remaining := v_order.coin_amount;

  IF COALESCE(v_helper.wallet_balance, 0) > 0 THEN
    v_wallet_deducted := LEAST(COALESCE(v_helper.wallet_balance, 0), v_remaining);
    v_remaining := v_remaining - v_wallet_deducted;
    UPDATE public.topup_helpers
       SET wallet_balance = wallet_balance - v_wallet_deducted,
           updated_at = now()
     WHERE id = v_order.helper_id;
  END IF;

  IF v_remaining > 0 THEN
    SELECT id, diamond_balance
      INTO v_agency_id, v_agency_bal
      FROM public.agencies
     WHERE owner_id = v_helper.user_id
     FOR UPDATE;

    IF v_agency_id IS NOT NULL AND COALESCE(v_agency_bal, 0) >= v_remaining THEN
      v_agency_deducted := v_remaining;
      v_remaining := 0;
      UPDATE public.agencies
         SET diamond_balance = diamond_balance - v_agency_deducted,
             updated_at = now()
       WHERE id = v_agency_id;
    END IF;
  END IF;

  IF v_remaining > 0 THEN
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers
         SET wallet_balance = wallet_balance + v_wallet_deducted,
             updated_at = now()
       WHERE id = v_order.helper_id;
    END IF;

    PERFORM set_config('app.bypass_helper_order_guard', 'true', true);
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object(
                  'failure_reason', 'helper_insufficient_balance_after_gateway_payment',
                  'wallet_deducted_rolled_back', v_wallet_deducted,
                  'helper_wallet_balance', COALESCE(v_helper.wallet_balance, 0),
                  'agency_balance', COALESCE(v_agency_bal, 0),
                  'needs_reconciliation', true,
                  'failed_at', now()
                )
     WHERE id = p_order_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'helper_insufficient_balance_after_gateway_payment',
      'needs_reconciliation', true,
      'wallet_balance', COALESCE(v_helper.wallet_balance, 0),
      'agency_balance', COALESCE(v_agency_bal, 0)
    );
  END IF;

  v_payment_ref := p_order_id::text || ':' || v_txn;

  BEGIN
    INSERT INTO public.coin_transactions (
      user_id, coins_amount, transaction_type, payment_method,
      payment_reference, status, notes
    )
    VALUES (
      v_order.user_id, v_order.coin_amount, 'recharge', v_gateway,
      v_payment_ref, 'completed',
      'gateway_helper_order:' || p_order_id::text || ' txn:' || v_txn
    )
    RETURNING id INTO v_coin_txn_id;
  EXCEPTION WHEN unique_violation THEN
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers
         SET wallet_balance = wallet_balance + v_wallet_deducted,
             updated_at = now()
       WHERE id = v_order.helper_id;
    END IF;
    IF v_agency_deducted > 0 AND v_agency_id IS NOT NULL THEN
      UPDATE public.agencies
         SET diamond_balance = diamond_balance + v_agency_deducted,
             updated_at = now()
       WHERE id = v_agency_id;
    END IF;
    PERFORM set_config('app.bypass_helper_order_guard', 'true', true);
    UPDATE public.helper_orders
       SET status = 'completed', processed_at = COALESCE(processed_at, now())
     WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'already_credited', true, 'payment_reference', v_payment_ref);
  END;

  SELECT COALESCE(diamonds, 0) INTO v_balance_before
    FROM public.profiles
   WHERE id = v_order.user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    DELETE FROM public.coin_transactions WHERE id = v_coin_txn_id;
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers SET wallet_balance = wallet_balance + v_wallet_deducted WHERE id = v_order.helper_id;
    END IF;
    IF v_agency_deducted > 0 AND v_agency_id IS NOT NULL THEN
      UPDATE public.agencies SET diamond_balance = diamond_balance + v_agency_deducted WHERE id = v_agency_id;
    END IF;
    PERFORM set_config('app.bypass_helper_order_guard', 'true', true);
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object('failure_reason', 'buyer_profile_not_found', 'needs_reconciliation', true, 'failed_at', now())
     WHERE id = p_order_id;
    RETURN jsonb_build_object('success', false, 'error', 'buyer_profile_not_found');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET diamonds = COALESCE(diamonds, 0) + v_order.coin_amount,
         total_recharged = COALESCE(total_recharged, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_order.user_id
   RETURNING diamonds INTO v_balance_after;

  UPDATE public.topup_helpers
     SET total_sold = COALESCE(total_sold, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_order.helper_id;

  PERFORM set_config('app.bypass_helper_order_guard', 'true', true);
  UPDATE public.helper_orders
     SET status = 'completed',
         processed_at = now(),
         provider_transaction_id = v_txn,
         payment_details = COALESCE(payment_details, '{}'::jsonb)
           || jsonb_build_object(
                'ipn_status', 'VALID',
                'gateway_credit_finalized_by', 'complete_gateway_helper_topup',
                'wallet_deducted', v_wallet_deducted,
                'agency_deducted', v_agency_deducted,
                'balance_before', v_balance_before,
                'balance_after', v_balance_after,
                'validation_data', COALESCE(p_validation_data, '{}'::jsonb)
              )
   WHERE id = p_order_id;

  BEGIN
    INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
    VALUES (v_helper.user_id, v_order.user_id, v_order.coin_amount, 'helper_gateway_topup', 'completed', 'Gateway helper top-up. Order: ' || p_order_id::text);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    INSERT INTO public.payment_reconciliation_log (
      user_id, gateway, order_id, transaction_id, amount_coins, amount_usd, metadata, status
    ) VALUES (
      v_order.user_id, v_gateway, p_order_id::text, v_txn, v_order.coin_amount, v_order.amount_usd,
      COALESCE(p_validation_data, '{}'::jsonb) || jsonb_build_object('helper_id', v_order.helper_id, 'wallet_deducted', v_wallet_deducted, 'agency_deducted', v_agency_deducted),
      'credited'
    );
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'coins_credited', v_order.coin_amount,
    'amount_credited', v_order.coin_amount,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'new_balance', v_balance_after,
    'wallet_deducted', v_wallet_deducted,
    'agency_deducted', v_agency_deducted,
    'payment_reference', v_payment_ref
  );
END;
$function$;

-- 19) deduct_coins
CREATE OR REPLACE FUNCTION public.deduct_coins(p_user_id uuid, p_amount integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _current bigint; _new bigint;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct from another user';
  END IF;
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT diamonds INTO _current FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF _current IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  IF _current < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  _new := _current - p_amount;
  UPDATE profiles SET diamonds = _new WHERE id = p_user_id;
  RETURN json_build_object('success', true, 'new_balance', _new);
END;
$function$;

-- 20) deduct_coins_atomic (bigint overload)
CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(p_user_id uuid, p_amount bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cur bigint; v_new bigint;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct from another user';
  END IF;

  SELECT diamonds INTO v_cur FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF v_cur < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_cur); END IF;
  v_new := v_cur - p_amount;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET diamonds = v_new WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true, 'new_balance', v_new);
END;
$function$;

-- 21) deduct_coins_atomic (integer + reason overload)
CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(p_user_id uuid, p_amount integer, p_reason text DEFAULT 'deduction'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cur bigint; v_new bigint; v_amt bigint;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct from another user';
  END IF;

  v_amt := GREATEST(0, p_amount::bigint);
  SELECT diamonds INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF v_cur < v_amt THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_cur); END IF;
  v_new := v_cur - v_amt;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET diamonds = v_new, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new);
END;
$function$;

-- 22) deduct_coins_from_user
CREATE OR REPLACE FUNCTION public.deduct_coins_from_user(p_user_id uuid, p_amount integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current bigint;
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR COALESCE(auth.role(), '') = 'service_role';
  v_admin_id uuid := public.current_admin_id_from_header();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF NOT v_is_service
     AND v_admin_id IS NULL
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct from another user';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN false; END IF;

  SELECT diamonds INTO v_current FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current IS NULL OR v_current < p_amount THEN RETURN false; END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET diamonds = diamonds - p_amount, updated_at = now() WHERE id = p_user_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN true;
END;
$function$;

-- 23) fix_excess_weekly_rewards (retarget diamond excess to profiles.diamonds)
CREATE OR REPLACE FUNCTION public.fix_excess_weekly_rewards()
 RETURNS TABLE(user_id uuid, category text, excess_beans bigint, excess_diamonds bigint, records_deleted bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    WITH ranked AS (
      SELECT h.id, h.user_id, h.category, h.reward_beans, h.reward_diamonds,
        ROW_NUMBER() OVER (PARTITION BY h.user_id, h.category ORDER BY h.sent_at ASC) as rn
      FROM leaderboard_reward_history h WHERE h.period_type = 'weekly'
    ),
    excess_per_user AS (
      SELECT r.user_id, r.category, SUM(r.reward_beans) as sum_beans, SUM(r.reward_diamonds) as sum_diamonds,
        array_agg(r.id) as ids_to_delete, COUNT(*) as cnt
      FROM ranked r WHERE r.rn > 1 GROUP BY r.user_id, r.category
    )
    SELECT * FROM excess_per_user
  LOOP
    IF v_rec.sum_beans > 0 THEN
      UPDATE profiles p SET beans = GREATEST(0, COALESCE(p.beans, 0) - v_rec.sum_beans) WHERE p.id = v_rec.user_id;
    END IF;
    IF v_rec.sum_diamonds > 0 THEN
      UPDATE profiles p SET diamonds = GREATEST(0, COALESCE(p.diamonds, 0) - v_rec.sum_diamonds) WHERE p.id = v_rec.user_id;
    END IF;
    DELETE FROM leaderboard_reward_history h WHERE h.id = ANY(v_rec.ids_to_delete);
    user_id := v_rec.user_id;
    category := v_rec.category;
    excess_beans := v_rec.sum_beans;
    excess_diamonds := v_rec.sum_diamonds;
    records_deleted := v_rec.cnt;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$function$;

-- 24) grant_welcome_bonus
CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bonus_coins INTEGER := 0;
  _bonus_diamonds INTEGER := 0;
  _msg_parts TEXT[] := ARRAY[]::TEXT[];
  _final_msg TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.welcome_bonuses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(setting_value, '')::INTEGER, 0) INTO _bonus_coins
  FROM public.app_settings WHERE setting_key = 'welcome_bonus_coins';

  SELECT COALESCE(NULLIF(setting_value, '')::INTEGER, 0) INTO _bonus_diamonds
  FROM public.app_settings WHERE setting_key = 'welcome_bonus_diamonds';

  _bonus_coins := COALESCE(_bonus_coins, 0);
  _bonus_diamonds := COALESCE(_bonus_diamonds, 0);

  IF _bonus_coins = 0 AND _bonus_diamonds = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Both legacy "coins" and "diamonds" welcome bonuses credit the spend wallet (diamonds)
  IF _bonus_coins > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _bonus_coins WHERE id = NEW.id;
    _msg_parts := array_append(_msg_parts, _bonus_coins || ' diamonds');
  END IF;

  IF _bonus_diamonds > 0 THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _bonus_diamonds WHERE id = NEW.id;
    _msg_parts := array_append(_msg_parts, _bonus_diamonds || ' diamonds');
  END IF;

  INSERT INTO public.welcome_bonuses (user_id, bonus_type, bonus_amount, claimed, claimed_at)
  VALUES (NEW.id, 'welcome_bonus', _bonus_coins + _bonus_diamonds, true, now());

  _final_msg := 'Welcome! You have received ' || array_to_string(_msg_parts, ' and ') || ' as a signup bonus.';

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.id,
    'welcome_bonus',
    '🎁 Welcome Bonus!',
    _final_msg,
    jsonb_build_object(
      'bonus_coins', _bonus_coins,
      'bonus_diamonds', _bonus_diamonds,
      'type', 'welcome_bonus'
    )
  );

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RAISE;
END;
$function$;

-- 25) helper_add_coins_to_user
CREATE OR REPLACE FUNCTION public.helper_add_coins_to_user(_user_id uuid, _amount integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_balance bigint;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: admin only');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET diamonds = COALESCE(diamonds, 0) + _amount,
      updated_at = now()
  WHERE id = _user_id
  RETURNING diamonds INTO _new_balance;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    COALESCE(auth.uid()::text, 'service_role'),
    'admin_add_coins_legacy_helper_path',
    _user_id::text,
    'user',
    jsonb_build_object('amount', _amount, 'type', 'admin_direct_credit')
  );

  RETURN json_build_object('success', true, 'new_balance', _new_balance);
END;
$function$;

-- 26) helper_transfer_coins_to_user (only receiver-credit line targets profiles.coins)
CREATE OR REPLACE FUNCTION public.helper_transfer_coins_to_user(_sender_id uuid, _receiver_id uuid, _amount bigint, _sender_type text DEFAULT 'trader_to_user'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  helper_rec RECORD;
  agency_rec RECORD;
  remaining bigint;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  total_available bigint := 0;
  new_receiver_coins bigint;
  v_sender_name text;
  helper_balance_before bigint := 0;
  helper_balance_after bigint := 0;
  agency_balance_before bigint := 0;
  agency_balance_after bigint := 0;
BEGIN
  PERFORM set_config('app.calling_function', 'helper_transfer_coins_to_user', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF NOT public.check_topup_trader_gate(
       _sender_id,
       'helper_transfer_coins_to_user',
       jsonb_build_object('kind','user','receiver_id', _receiver_id, 'sender_type', _sender_type),
       _amount
     ) THEN
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can transfer');
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> _sender_id THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized sender'); END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive'); END IF;
  IF _sender_id = _receiver_id THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself'); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _receiver_id AND COALESCE(is_banned, false) = false AND COALESCE(is_deleted, false) = false AND COALESCE(is_blocked, false) = false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receiver not found or unavailable');
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users WHERE (blocker_id = _sender_id AND blocked_id = _receiver_id) OR (blocker_id = _receiver_id AND blocked_id = _sender_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer blocked between these users');
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), app_uid, 'Trader') INTO v_sender_name FROM public.profiles WHERE id = _sender_id;
  SELECT id, wallet_balance INTO helper_rec FROM public.topup_helpers WHERE user_id = _sender_id AND COALESCE(is_active, true) = true AND COALESCE(is_verified, false) = true AND COALESCE(trader_level, 0) BETWEEN 1 AND 5 ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  SELECT id, diamond_balance INTO agency_rec FROM public.agencies WHERE owner_id = _sender_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;

  total_available := COALESCE(helper_rec.wallet_balance, 0)::bigint + COALESCE(agency_rec.diamond_balance, 0)::bigint;
  IF total_available < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient trader wallet balance', 'available', total_available);
  END IF;

  remaining := _amount;
  IF COALESCE(_sender_type, '') LIKE 'agency%' THEN
    IF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
      agency_balance_before := COALESCE(agency_rec.diamond_balance, 0)::bigint;
      agency_deducted := LEAST(remaining, agency_balance_before);
      agency_balance_after := agency_balance_before - agency_deducted;
      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies SET diamond_balance = agency_balance_after, updated_at = now() WHERE id = agency_rec.id;
      INSERT INTO public.agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id)
      VALUES (agency_rec.id, 'trader_transfer_to_user_out', 0, agency_deducted, 0, _receiver_id);
      remaining := remaining - agency_deducted;
    END IF;
    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
      helper_balance_before := COALESCE(helper_rec.wallet_balance, 0)::bigint;
      helper_deducted := LEAST(remaining, helper_balance_before);
      helper_balance_after := helper_balance_before - helper_deducted;
      UPDATE public.topup_helpers SET wallet_balance = helper_balance_after, updated_at = now() WHERE id = helper_rec.id;
      INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
      VALUES (helper_rec.id, 'transfer_to_user_debit', -helper_deducted, helper_balance_before::integer, helper_balance_after::integer, _receiver_id, 'Trader wallet transfer to user debit', _sender_id);
      remaining := remaining - helper_deducted;
    END IF;
  ELSE
    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
      helper_balance_before := COALESCE(helper_rec.wallet_balance, 0)::bigint;
      helper_deducted := LEAST(remaining, helper_balance_before);
      helper_balance_after := helper_balance_before - helper_deducted;
      UPDATE public.topup_helpers SET wallet_balance = helper_balance_after, updated_at = now() WHERE id = helper_rec.id;
      INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
      VALUES (helper_rec.id, 'transfer_to_user_debit', -helper_deducted, helper_balance_before::integer, helper_balance_after::integer, _receiver_id, 'Trader wallet transfer to user debit', _sender_id);
      remaining := remaining - helper_deducted;
    END IF;
    IF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
      agency_balance_before := COALESCE(agency_rec.diamond_balance, 0)::bigint;
      agency_deducted := LEAST(remaining, agency_balance_before);
      agency_balance_after := agency_balance_before - agency_deducted;
      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies SET diamond_balance = agency_balance_after, updated_at = now() WHERE id = agency_rec.id;
      INSERT INTO public.agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id)
      VALUES (agency_rec.id, 'trader_transfer_to_user_out', 0, agency_deducted, 0, _receiver_id);
      remaining := remaining - agency_deducted;
    END IF;
  END IF;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Trader wallet funding miscalculation (remaining=%)', remaining USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _amount WHERE id = _receiver_id RETURNING diamonds INTO new_receiver_coins;
  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes) VALUES (_sender_id, _amount, 'transfer_out', 'completed', 'Transfer to user ' || _receiver_id::text);
  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes) VALUES (_receiver_id, _amount, 'transfer_in', 'completed', 'Transfer from ' || _sender_id::text);
  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes) VALUES (_sender_id, _receiver_id, _amount, _sender_type, 'completed', 'Trader wallet transfer to user');
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at) VALUES (_receiver_id, 'coins_received', 'Diamonds Received', _amount::text || ' diamonds received from ' || COALESCE(v_sender_name, 'Trader'), jsonb_build_object('sender_id', _sender_id, 'amount', _amount, 'source', _sender_type, 'action_url', '/recharge-history'), false, now());
  RETURN jsonb_build_object('success', true, 'helper_deducted', helper_deducted, 'agency_deducted', agency_deducted, 'user_deducted', 0, 'new_receiver_coins', new_receiver_coins);
END;
$function$;

-- 27) helper_transfer_diamonds_to_self
CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(_user_id uuid, _amount bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  helper_rec RECORD;
  agency_rec RECORD;
  helper_balance_before numeric := 0;
  helper_balance_after numeric := 0;
  agency_balance_before bigint := 0;
  agency_balance_after bigint := 0;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  total_available numeric := 0;
  remaining bigint := 0;
  new_coins bigint := 0;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.calling_function', 'helper_transfer_diamonds_to_self', true);

  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized sender');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF NOT public.check_topup_trader_gate(
       _user_id,
       'helper_transfer_diamonds_to_self',
       jsonb_build_object('kind','self'),
       _amount
     ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;

  SELECT id, COALESCE(wallet_balance, 0)::numeric AS wallet_balance
    INTO helper_rec
    FROM public.topup_helpers
   WHERE user_id = _user_id
     AND COALESCE(is_active, true) = true
     AND COALESCE(is_verified, false) = true
     AND COALESCE(trader_level, 0) BETWEEN 1 AND 5
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;

  IF helper_rec.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper trader account not found or inactive');
  END IF;

  SELECT id, COALESCE(diamond_balance, 0)::bigint AS diamond_balance
    INTO agency_rec
    FROM public.agencies
   WHERE owner_id = _user_id
     AND COALESCE(is_active, true) = true
     AND COALESCE(is_blocked, false) = false
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;

  helper_balance_before := COALESCE(helper_rec.wallet_balance, 0);
  agency_balance_before := COALESCE(agency_rec.diamond_balance, 0);
  total_available := GREATEST(helper_balance_before, 0) + agency_balance_before;

  IF total_available < _amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient trader wallet balance',
      'available', total_available,
      'requested', _amount,
      'helper_wallet_balance', helper_balance_before,
      'agency_diamond_balance', agency_balance_before
    );
  END IF;

  remaining := _amount;

  IF helper_balance_before > 0 AND remaining > 0 THEN
    helper_deducted := LEAST(remaining, FLOOR(helper_balance_before)::bigint);
    helper_balance_after := helper_balance_before - helper_deducted;

    UPDATE public.topup_helpers
       SET wallet_balance = helper_balance_after,
           updated_at = now()
     WHERE id = helper_rec.id;

    INSERT INTO public.helper_transactions (
      helper_id, transaction_type, amount, balance_before, balance_after,
      reference_id, description, user_id, created_at
    ) VALUES (
      helper_rec.id, 'self_recharge_debit', -helper_deducted,
      helper_balance_before::bigint, helper_balance_after::bigint,
      _user_id, 'Trader wallet self recharge debit (helper wallet)', _user_id, now()
    );

    remaining := remaining - helper_deducted;
  ELSE
    helper_balance_after := helper_balance_before;
  END IF;

  IF agency_rec.id IS NOT NULL AND agency_balance_before > 0 AND remaining > 0 THEN
    agency_deducted := LEAST(remaining, agency_balance_before);
    agency_balance_after := agency_balance_before - agency_deducted;

    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);

    UPDATE public.agencies
       SET diamond_balance = agency_balance_after,
           updated_at = now()
     WHERE id = agency_rec.id;

    INSERT INTO public.agency_diamond_transactions (
      agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id, description
    ) VALUES (
      agency_rec.id, 'trader_self_recharge_out', 0, agency_deducted, 0, _user_id,
      'Trader wallet self recharge debit (agency diamond wallet)'
    );

    remaining := remaining - agency_deducted;
  ELSE
    agency_balance_after := agency_balance_before;
  END IF;

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Trader wallet funding miscalculation (remaining=%)', remaining USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET diamonds = COALESCE(diamonds, 0) + _amount,
         updated_at = now()
   WHERE id = _user_id
  RETURNING diamonds INTO new_coins;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes)
  VALUES (_user_id, _amount::integer, 'self_recharge', 'completed', 'Trader wallet self recharge');

  RETURN jsonb_build_object(
    'success', true,
    'helper_deducted', helper_deducted,
    'agency_deducted', agency_deducted,
    'recharged_amount', _amount,
    'new_coins', new_coins,
    'new_coin_balance', new_coins,
    'new_wallet_balance', helper_balance_after,
    'new_helper_wallet_balance', helper_balance_after,
    'new_agency_balance', agency_balance_after,
    'available_balance', GREATEST(helper_balance_after, 0) + agency_balance_after,
    'source', CASE
      WHEN helper_deducted > 0 AND agency_deducted > 0 THEN 'helper_wallet+agency_diamond'
      WHEN agency_deducted > 0 THEN 'agency_diamond'
      ELSE 'helper_wallet'
    END
  );
END;
$function$;

-- 28) process_helper_order_secure
CREATE OR REPLACE FUNCTION public.process_helper_order_secure(_order_id uuid, _action text, _notes text DEFAULT NULL::text)
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
    SELECT COALESCE(diamonds, 0) INTO v_new_user_balance FROM public.profiles WHERE id = v_order.user_id;
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
     SET diamonds = COALESCE(diamonds, 0) + v_order.coin_amount,
         total_recharged = COALESCE(total_recharged, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_order.user_id
   RETURNING COALESCE(diamonds, 0) INTO v_new_user_balance;

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

-- 29) transfer_coins_to_user
CREATE OR REPLACE FUNCTION public.transfer_coins_to_user(_sender_id uuid, _receiver_id uuid, _amount integer, _note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _sender_id = _receiver_id THEN RAISE EXCEPTION 'Cannot transfer to yourself'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM _sender_id THEN
    RAISE EXCEPTION 'Unauthorized: caller must be the sender';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET diamonds = diamonds - _amount WHERE id = _sender_id AND diamonds >= _amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _amount WHERE id = _receiver_id;
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, notes)
  VALUES (_sender_id, _receiver_id, _amount, _note);
  RETURN TRUE;
END;
$function$;

-- 30) user_complete_instant_helper_topup
CREATE OR REPLACE FUNCTION public.user_complete_instant_helper_topup(_order_id uuid)
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
  v_helper_active boolean;
  v_helper_verified boolean;
  v_agency_id uuid;
  v_agency_bal numeric;
  v_remaining numeric;
  v_wallet_deducted numeric := 0;
  v_agency_deducted numeric := 0;
  v_new_user_balance bigint;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_order FROM public.helper_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;
  IF v_order.user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already', 'completed');
  END IF;
  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_pending', 'status', v_order.status);
  END IF;
  IF COALESCE(v_order.coin_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_coin_amount');
  END IF;

  PERFORM set_config('app.bypass_helper_order_guard', 'true', true);

  SELECT wallet_balance, user_id, is_active, is_verified
    INTO v_helper_wallet, v_helper_user_id, v_helper_active, v_helper_verified
    FROM public.topup_helpers
   WHERE id = v_order.helper_id
   FOR UPDATE;
  IF v_helper_user_id IS NULL THEN
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('failure_reason', 'helper_not_found')
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'helper_not_found');
  END IF;
  IF NOT COALESCE(v_helper_active, false) OR NOT COALESCE(v_helper_verified, false) THEN
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('failure_reason', 'helper_not_active_or_verified')
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'helper_not_active_or_verified');
  END IF;
  IF COALESCE(v_helper_wallet, 0) < 0 THEN
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('failure_reason', 'helper_wallet_corrupt', 'wallet_balance', v_helper_wallet)
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'helper_wallet_corrupt');
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
    UPDATE public.topup_helpers
       SET wallet_balance = wallet_balance - v_wallet_deducted,
           updated_at = now()
     WHERE id = v_order.helper_id;
  END IF;

  IF v_remaining > 0 THEN
    SELECT a.id, a.diamond_balance
      INTO v_agency_id, v_agency_bal
      FROM public.agencies a
     WHERE a.owner_id = v_helper_user_id
     FOR UPDATE;
    IF v_agency_id IS NOT NULL AND COALESCE(v_agency_bal, 0) >= v_remaining THEN
      v_agency_deducted := v_remaining;
      v_remaining := 0;
      UPDATE public.agencies
         SET diamond_balance = diamond_balance - v_agency_deducted,
             updated_at = now()
       WHERE id = v_agency_id;
    END IF;
  END IF;

  IF v_remaining > 0 THEN
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers SET wallet_balance = wallet_balance + v_wallet_deducted WHERE id = v_order.helper_id;
    END IF;
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object('failure_reason', 'helper_insufficient_balance', 'wallet_balance', COALESCE(v_helper_wallet, 0), 'agency_balance', COALESCE(v_agency_bal, 0))
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'helper_insufficient_balance', 'wallet_balance', COALESCE(v_helper_wallet, 0), 'agency_balance', COALESCE(v_agency_bal, 0));
  END IF;

  UPDATE public.topup_helpers
     SET total_sold = COALESCE(total_sold, 0) + v_order.coin_amount
   WHERE id = v_order.helper_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET diamonds = COALESCE(diamonds, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_uid
   RETURNING diamonds INTO v_new_user_balance;

  IF NOT FOUND THEN
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('failure_reason', 'buyer_profile_not_found', 'needs_reconciliation', true)
     WHERE id = _order_id;
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers SET wallet_balance = wallet_balance + v_wallet_deducted WHERE id = v_order.helper_id;
    END IF;
    IF v_agency_deducted > 0 AND v_agency_id IS NOT NULL THEN
      UPDATE public.agencies SET diamond_balance = diamond_balance + v_agency_deducted WHERE id = v_agency_id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'buyer_profile_not_found');
  END IF;

  UPDATE public.helper_orders
     SET status = 'completed', processed_at = now()
   WHERE id = _order_id;

  BEGIN
    INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
    VALUES (v_helper_user_id, v_uid, v_order.coin_amount, 'helper_topup', 'completed', 'Instant helper top-up. Order: ' || _order_id::text);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'order_id', _order_id, 'coins_credited', v_order.coin_amount, 'new_balance', v_new_user_balance, 'wallet_deducted', v_wallet_deducted, 'agency_deducted', v_agency_deducted);
END;
$function$;

-- Pkg331 pass-3: local gateway helper top-up must deduct helper/agency balance atomically

CREATE OR REPLACE FUNCTION public.complete_gateway_helper_topup(
  p_order_id uuid,
  p_gateway text,
  p_transaction_id text,
  p_validation_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    -- If an older callback already credited this exact order+transaction, roll back the deductions from this retry.
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

  SELECT COALESCE(coins, 0) INTO v_balance_before
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
     SET coins = COALESCE(coins, 0) + v_order.coin_amount,
         total_recharged = COALESCE(total_recharged, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_order.user_id
   RETURNING coins INTO v_balance_after;

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
$$;

REVOKE ALL ON FUNCTION public.complete_gateway_helper_topup(uuid, text, text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_gateway_helper_topup(uuid, text, text, jsonb) TO authenticated, service_role;
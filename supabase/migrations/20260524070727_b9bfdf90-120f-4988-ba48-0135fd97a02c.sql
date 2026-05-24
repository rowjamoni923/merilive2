-- Section #6 Recharge pass-8: secure helper/admin manual order processing

CREATE OR REPLACE FUNCTION public.process_helper_order_secure(
  _order_id uuid,
  _action text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  IF lower(coalesce(_action, '')) NOT IN ('complete', 'approve', 'cancel', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;

  SELECT * INTO v_order
  FROM public.helper_orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  SELECT wallet_balance, user_id
    INTO v_helper_wallet, v_helper_user_id
    FROM public.topup_helpers
   WHERE id = v_order.helper_id
   FOR UPDATE;

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
       SET status = 'cancelled',
           processed_at = now(),
           helper_notes = COALESCE(_notes, helper_notes),
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object('cancelled_by', CASE WHEN v_is_admin THEN 'admin' ELSE 'helper' END, 'cancelled_at', now())
     WHERE id = _order_id;

    RETURN jsonb_build_object('success', true, 'status', 'cancelled');
  END IF;

  -- Only manually-submitted helper orders can be manually completed.
  -- gateway_pending orders belong to verified IPN flow and must never be approved by button.
  IF v_order.status = 'gateway_pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'gateway_pending_requires_ipn');
  END IF;

  IF v_order.status = 'completed' THEN
    SELECT COALESCE(coins, 0) INTO v_new_user_balance FROM public.profiles WHERE id = v_order.user_id;
    RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'newBalance', COALESCE(v_new_user_balance, 0));
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

    UPDATE public.topup_helpers
       SET wallet_balance = wallet_balance - v_wallet_deducted,
           updated_at = now()
     WHERE id = v_order.helper_id;
  END IF;

  IF v_remaining > 0 THEN
    SELECT id, diamond_balance
      INTO v_agency_id, v_agency_bal
      FROM public.agencies
     WHERE owner_id = v_helper_user_id
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
           helper_notes = COALESCE(_notes, helper_notes),
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object(
               'failure_reason', 'helper_insufficient_balance',
               'wallet_balance', COALESCE(v_helper_wallet, 0),
               'agency_balance', COALESCE(v_agency_bal, 0)
             )
     WHERE id = _order_id;

    RETURN jsonb_build_object('success', false, 'error', 'helper_insufficient_balance');
  END IF;

  UPDATE public.topup_helpers
     SET total_sold = COALESCE(total_sold, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_order.helper_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_order.user_id
   RETURNING COALESCE(coins, 0) INTO v_new_user_balance;

  IF NOT FOUND THEN
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers SET wallet_balance = wallet_balance + v_wallet_deducted WHERE id = v_order.helper_id;
    END IF;
    IF v_agency_deducted > 0 AND v_agency_id IS NOT NULL THEN
      UPDATE public.agencies SET diamond_balance = diamond_balance + v_agency_deducted WHERE id = v_agency_id;
    END IF;
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('failure_reason', 'buyer_profile_not_found')
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'buyer_profile_not_found');
  END IF;

  UPDATE public.helper_orders
     SET status = 'completed',
         processed_at = now(),
         helper_notes = COALESCE(_notes, helper_notes),
         payment_details = COALESCE(payment_details, '{}'::jsonb)
           || jsonb_build_object(
             'completed_by', CASE WHEN v_is_admin THEN 'admin' ELSE 'helper' END,
             'wallet_deducted', v_wallet_deducted,
             'agency_deducted', v_agency_deducted,
             'balance_after', v_new_user_balance
           )
   WHERE id = _order_id;

  BEGIN
    INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
    VALUES (v_helper_user_id, v_order.user_id, v_order.coin_amount, 'helper_topup', 'completed', 'Manual helper top-up. Order: ' || _order_id::text);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'completed',
    'creditedCoins', v_order.coin_amount,
    'newBalance', v_new_user_balance,
    'walletDeducted', v_wallet_deducted,
    'agencyDeducted', v_agency_deducted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_helper_order_secure(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.process_helper_order_secure(uuid, text, text) TO anon, authenticated;
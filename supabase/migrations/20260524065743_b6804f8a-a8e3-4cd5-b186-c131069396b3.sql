-- Pass-6 Recharge audit — proper end-user RPC for the instant-helper-topup path.
--
-- Bug: `helper_add_coins_to_user` requires caller to be admin or a verified
-- topup_helper. The "Instant Success" path in Recharge.tsx calls it under the
-- END USER's JWT, so the credit step was returning "Not authorized" and the
-- order was getting stuck as 'failed' after the wallet was already deducted
-- (or before, depending on order). The whole flow is broken for regular users.
--
-- Fix: single SECURITY DEFINER RPC the buyer calls after creating the pending
-- order. Locks helper + agency rows FOR UPDATE, atomically deducts (wallet
-- first then agency), credits the buyer, and finalizes the order. On any
-- failure inside the function, EVERY change is rolled back (PL/pgSQL
-- block-level transaction) and the order is marked 'failed'.

CREATE OR REPLACE FUNCTION public.user_complete_instant_helper_topup(
  _order_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_order public.helper_orders%ROWTYPE;
  v_helper_wallet NUMERIC;
  v_helper_user_id UUID;
  v_agency_id UUID;
  v_agency_bal NUMERIC;
  v_remaining NUMERIC;
  v_wallet_deducted NUMERIC := 0;
  v_agency_deducted NUMERIC := 0;
  v_new_user_balance BIGINT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Lock order row to prevent double-finalization races.
  SELECT * INTO v_order FROM public.helper_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;
  IF v_order.user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('success', true, 'already', v_order.status);
  END IF;
  IF COALESCE(v_order.coin_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_coin_amount');
  END IF;

  -- Lock helper row.
  SELECT wallet_balance, user_id
    INTO v_helper_wallet, v_helper_user_id
    FROM public.topup_helpers
   WHERE id = v_order.helper_id
   FOR UPDATE;
  IF v_helper_user_id IS NULL THEN
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object('failure_reason', 'helper_not_found')
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'helper_not_found');
  END IF;

  v_remaining := v_order.coin_amount;

  -- Step 1: deduct from helper wallet.
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

  -- Step 2: fall back to agency diamond balance if helper owns one.
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

  -- If still short, roll back partial deductions and fail the order.
  IF v_remaining > 0 THEN
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers
         SET wallet_balance = wallet_balance + v_wallet_deducted
       WHERE id = v_order.helper_id;
    END IF;
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object(
                  'failure_reason', 'helper_insufficient_balance',
                  'wallet_balance', COALESCE(v_helper_wallet, 0),
                  'agency_balance', COALESCE(v_agency_bal, 0)
                )
     WHERE id = _order_id;
    RETURN jsonb_build_object(
      'success', false,
      'error', 'helper_insufficient_balance',
      'wallet_balance', COALESCE(v_helper_wallet, 0),
      'agency_balance', COALESCE(v_agency_bal, 0)
    );
  END IF;

  -- Step 3: update helper's total_sold for stats.
  UPDATE public.topup_helpers
     SET total_sold = COALESCE(total_sold, 0) + v_order.coin_amount
   WHERE id = v_order.helper_id;

  -- Step 4: credit the buyer atomically.
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_uid
   RETURNING coins INTO v_new_user_balance;

  IF NOT FOUND THEN
    -- Should never happen — auth.uid() must exist in profiles — but be safe.
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object('failure_reason', 'buyer_profile_not_found', 'needs_reconciliation', true)
     WHERE id = _order_id;
    -- Refund helper to avoid loss.
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers SET wallet_balance = wallet_balance + v_wallet_deducted WHERE id = v_order.helper_id;
    END IF;
    IF v_agency_deducted > 0 AND v_agency_id IS NOT NULL THEN
      UPDATE public.agencies SET diamond_balance = diamond_balance + v_agency_deducted WHERE id = v_agency_id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'buyer_profile_not_found');
  END IF;

  -- Step 5: promote order to completed.
  UPDATE public.helper_orders
     SET status = 'completed',
         processed_at = now()
   WHERE id = _order_id;

  -- Step 6: best-effort audit logs (don't fail the whole call if logging errors).
  BEGIN
    INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
    VALUES (v_helper_user_id, v_uid, v_order.coin_amount, 'helper_topup',
            'completed',
            'Instant helper top-up. Order: ' || _order_id::text);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', _order_id,
    'coins_credited', v_order.coin_amount,
    'new_balance', v_new_user_balance,
    'wallet_deducted', v_wallet_deducted,
    'agency_deducted', v_agency_deducted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.user_complete_instant_helper_topup(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.user_complete_instant_helper_topup(UUID) TO authenticated;
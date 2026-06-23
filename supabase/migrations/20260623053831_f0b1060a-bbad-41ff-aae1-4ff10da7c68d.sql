
-- 1) Repair the only negative wallet so we can add the CHECK constraint
UPDATE public.topup_helpers
   SET wallet_balance = 0, updated_at = now()
 WHERE wallet_balance < 0;

-- Defensive: any agency / user with negative balance gets clamped to 0 too
UPDATE public.agencies SET diamond_balance = 0, updated_at = now() WHERE diamond_balance < 0;
UPDATE public.profiles SET coins = 0, updated_at = now() WHERE coins < 0;

-- 2) Hard DB-level guards so balances cannot go negative ever again
ALTER TABLE public.topup_helpers
  DROP CONSTRAINT IF EXISTS topup_helpers_wallet_balance_nonneg,
  ADD CONSTRAINT topup_helpers_wallet_balance_nonneg CHECK (wallet_balance >= 0);

ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_diamond_balance_nonneg,
  ADD CONSTRAINT agencies_diamond_balance_nonneg CHECK (diamond_balance >= 0);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_coins_nonneg,
  ADD CONSTRAINT profiles_coins_nonneg CHECK (coins >= 0);

-- 3) Harden the recharge finalize RPC.
--    Existing behaviour kept; we tighten:
--      * helper must be active + verified
--      * helper wallet_balance must be >= 0 before any deduction
--      * status must be 'pending' (already there; reinforced with explicit reject for completed/failed)
CREATE OR REPLACE FUNCTION public.user_complete_instant_helper_topup(_order_id uuid)
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
  -- Idempotent: only finalize once. Completed/failed orders cannot be reused.
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
    -- Defensive: should never happen now that CHECK constraint exists, but never debit a negative wallet
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
     SET coins = COALESCE(coins, 0) + v_order.coin_amount,
         updated_at = now()
   WHERE id = v_uid
   RETURNING coins INTO v_new_user_balance;

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
$$;

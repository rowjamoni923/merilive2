-- Pkg331 pass-2: finish helper trader critical gaps

-- 1) Make helper upgrade request table compatible with the live HelperDashboard form.
ALTER TABLE public.helper_upgrade_requests
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS amount_usd numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS notes text;

-- 2) Tighten helper_country_payment_methods UPDATE/DELETE as well as INSERT.
-- Previously a helper could keep editing/removing payment rows after losing L5/payroll/verified status.
DROP POLICY IF EXISTS "Helpers can update their own payment methods" ON public.helper_country_payment_methods;
DROP POLICY IF EXISTS "Helpers can delete their own payment methods" ON public.helper_country_payment_methods;
DROP POLICY IF EXISTS "Helpers can insert their own payment methods" ON public.helper_country_payment_methods;

CREATE POLICY "Helpers can insert their own payment methods"
ON public.helper_country_payment_methods
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_country_payment_methods.helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_verified = true
      AND th.is_active = true
  )
);

CREATE POLICY "Helpers can update their own payment methods"
ON public.helper_country_payment_methods
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_country_payment_methods.helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_verified = true
      AND th.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_country_payment_methods.helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_verified = true
      AND th.is_active = true
  )
);

CREATE POLICY "Helpers can delete their own payment methods"
ON public.helper_country_payment_methods
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_country_payment_methods.helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_verified = true
      AND th.is_active = true
  )
);

-- 3) Add an explicit server-side bypass flag for trusted SECURITY DEFINER flows only.
CREATE OR REPLACE FUNCTION public.guard_helper_orders_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_is_admin boolean := public.is_admin(v_caller) OR public.is_active_admin_session();
  v_is_helper boolean;
  v_is_buyer boolean;
BEGIN
  IF current_setting('app.bypass_helper_order_guard', true) = 'true'
     OR v_is_service OR v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_is_helper := EXISTS (
    SELECT 1 FROM public.topup_helpers th
     WHERE th.id = OLD.helper_id AND th.user_id = v_caller
  );
  v_is_buyer := OLD.user_id = v_caller;

  IF NOT (v_is_helper OR v_is_buyer) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  IF NEW.helper_id IS DISTINCT FROM OLD.helper_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.package_id IS DISTINCT FROM OLD.package_id
     OR NEW.coin_amount IS DISTINCT FROM OLD.coin_amount
     OR NEW.amount_usd IS DISTINCT FROM OLD.amount_usd
     OR NEW.amount_local IS DISTINCT FROM OLD.amount_local
     OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.user_country_code IS DISTINCT FROM OLD.user_country_code
     OR NEW.user_payment_proof IS DISTINCT FROM OLD.user_payment_proof
     OR NEW.provider_transaction_id IS DISTINCT FROM OLD.provider_transaction_id THEN
    RAISE EXCEPTION 'Field not updatable by client' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status NOT IN ('pending','processing','completed','failed','cancelled') THEN
      RAISE EXCEPTION 'Invalid status' USING ERRCODE = '22023';
    END IF;
    IF v_is_buyer AND NOT v_is_helper THEN
      IF NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
        RAISE EXCEPTION 'Buyers can only cancel pending orders' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF OLD.status IN ('completed','failed','cancelled') THEN
      RAISE EXCEPTION 'Order is final' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.notes IS NOT NULL THEN NEW.notes := left(NEW.notes, 1000); END IF;
  IF NEW.payment_method IS NOT NULL THEN NEW.payment_method := left(NEW.payment_method, 80); END IF;

  RETURN NEW;
END;
$$;

-- 4) Set the bypass flag inside the trusted buyer finalizer before it updates helper_orders.
CREATE OR REPLACE FUNCTION public.user_complete_instant_helper_topup(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('success', true, 'already', v_order.status);
  END IF;
  IF COALESCE(v_order.coin_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_coin_amount');
  END IF;

  PERFORM set_config('app.bypass_helper_order_guard', 'true', true);

  SELECT wallet_balance, user_id
    INTO v_helper_wallet, v_helper_user_id
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

REVOKE ALL ON FUNCTION public.user_complete_instant_helper_topup(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_complete_instant_helper_topup(uuid) TO authenticated;
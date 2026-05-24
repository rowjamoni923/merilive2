-- Pkg325 Wallet pass-1: fix unauth-mint / unauth-drain RPCs

CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id uuid, _amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_role text; v_pending uuid; v_is_service boolean;
BEGIN
  v_is_service := COALESCE(auth.role(), '') = 'service_role';
  IF NOT v_is_service
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF NOT v_is_service THEN
    v_role := public._current_admin_role();
    IF v_role = 'sub_admin' THEN
      v_pending := public._enqueue_admin_pending_action('add_diamonds', _user_id, NULL,
        jsonb_build_object('user_id', _user_id, 'amount', _amount), NULL);
      RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
    END IF;
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
  RETURN jsonb_build_object('success', true);
END $$;

DROP FUNCTION IF EXISTS public.safe_credit_diamonds(uuid, integer, text, text, text, numeric, jsonb);
CREATE FUNCTION public.safe_credit_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_gateway text DEFAULT NULL,
  p_order_id text DEFAULT NULL,
  p_transaction_id text DEFAULT NULL,
  p_amount_usd numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _new_balance integer;
  _payment_ref text;
  _inserted_id uuid;
  _is_service boolean;
BEGIN
  _is_service := COALESCE(auth.role(), '') = 'service_role';
  IF NOT _is_service
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
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
    INSERT INTO public.coin_transactions (
      user_id, coins_amount, transaction_type, payment_method,
      payment_reference, status, notes
    )
    VALUES (
      p_user_id, p_amount, 'recharge', p_gateway,
      _payment_ref, 'completed',
      'order:' || COALESCE(p_order_id, 'N/A') || ' txn:' || COALESCE(p_transaction_id, 'N/A')
    )
    RETURNING id INTO _inserted_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', true, 'already_credited', true, 'payment_reference', _payment_ref);
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
    INSERT INTO public.payment_reconciliation_log (
      user_id, gateway, order_id, transaction_id,
      amount_coins, amount_usd, metadata, status
    )
    VALUES (
      p_user_id, p_gateway, p_order_id, p_transaction_id,
      p_amount, p_amount_usd, p_metadata, 'credited'
    );
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  RETURN json_build_object(
    'success', true,
    'new_balance', _new_balance,
    'amount_credited', p_amount,
    'payment_reference', _payment_ref
  );
END $$;

CREATE OR REPLACE FUNCTION public.add_to_helper_wallet(_helper_id uuid, _amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  UPDATE topup_helpers SET wallet_balance = COALESCE(wallet_balance, 0) + _amount WHERE id = _helper_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Helper not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.helper_add_diamonds_to_agency(_agency_id uuid, _amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  PERFORM set_config('app.bypass_agency_economy_guard','true',true);
  UPDATE agencies SET diamond_balance = COALESCE(diamond_balance,0) + _amount, updated_at = now() WHERE id = _agency_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  RETURN jsonb_build_object('success', true);
END $$;

CREATE OR REPLACE FUNCTION public.deduct_coins_from_user(p_user_id uuid, p_amount integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_current integer;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct from another user';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN false; END IF;
  SELECT coins INTO v_current FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current IS NULL OR v_current < p_amount THEN RETURN false; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = coins - p_amount WHERE id = p_user_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.deduct_helper_wallet(_helper_id uuid, _amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE current_bal numeric; v_owner uuid;
BEGIN
  SELECT wallet_balance, user_id INTO current_bal, v_owner FROM topup_helpers WHERE id = _helper_id FOR UPDATE;
  IF current_bal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found');
  END IF;
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM v_owner) THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct another helper wallet';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  IF current_bal < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance', 'balance', current_bal);
  END IF;
  UPDATE topup_helpers SET wallet_balance = wallet_balance - _amount, updated_at = now() WHERE id = _helper_id;
  RETURN jsonb_build_object('success', true, 'new_balance', current_bal - _amount);
END $$;

DROP FUNCTION IF EXISTS public.deduct_helper_wallet(uuid, numeric, boolean);
CREATE FUNCTION public.deduct_helper_wallet(_helper_id uuid, _amount numeric, _update_total_sold boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  current_bal numeric;
  helper_user_id uuid;
  agency_bal numeric;
  agency_id_val uuid;
  remaining numeric;
  wallet_deducted numeric := 0;
  agency_deducted numeric := 0;
BEGIN
  SELECT wallet_balance, user_id INTO current_bal, helper_user_id 
  FROM topup_helpers WHERE id = _helper_id FOR UPDATE;
  IF current_bal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found');
  END IF;
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM helper_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct another helper wallet';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  remaining := _amount;
  IF current_bal > 0 THEN
    IF current_bal >= remaining THEN wallet_deducted := remaining; remaining := 0;
    ELSE wallet_deducted := current_bal; remaining := remaining - current_bal; END IF;
    UPDATE topup_helpers SET wallet_balance = wallet_balance - wallet_deducted, updated_at = now() WHERE id = _helper_id;
  END IF;
  IF remaining > 0 THEN
    SELECT a.id, a.diamond_balance INTO agency_id_val, agency_bal
    FROM agencies a WHERE a.owner_id = helper_user_id FOR UPDATE;
    IF agency_id_val IS NOT NULL AND agency_bal >= remaining THEN
      agency_deducted := remaining; remaining := 0;
      UPDATE agencies SET diamond_balance = diamond_balance - agency_deducted, updated_at = now() WHERE id = agency_id_val;
    ELSIF agency_id_val IS NOT NULL AND agency_bal > 0 THEN
      agency_deducted := agency_bal; remaining := remaining - agency_bal;
      UPDATE agencies SET diamond_balance = 0, updated_at = now() WHERE id = agency_id_val;
    END IF;
  END IF;
  IF remaining > 0 THEN
    IF wallet_deducted > 0 THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance + wallet_deducted WHERE id = _helper_id;
    END IF;
    IF agency_deducted > 0 THEN
      UPDATE agencies SET diamond_balance = diamond_balance + agency_deducted WHERE id = agency_id_val;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', current_bal, 'agency_balance', COALESCE(agency_bal, 0));
  END IF;
  IF _update_total_sold THEN
    UPDATE topup_helpers SET total_sold = COALESCE(total_sold, 0) + _amount WHERE id = _helper_id;
  END IF;
  RETURN jsonb_build_object(
    'success', true, 
    'new_balance', current_bal - wallet_deducted,
    'wallet_deducted', wallet_deducted,
    'agency_deducted', agency_deducted
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.add_diamonds_to_user(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_coins(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_coins_to_user(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_beans_to_user(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_beans_to_host(uuid, integer, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_to_helper_wallet(uuid, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.helper_add_coins_to_user(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.helper_add_diamonds_to_agency(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_user_coins(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_agency_coins(uuid, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_agency_beans(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_coins(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_coins_atomic(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_coins_atomic(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_coins_from_user(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_helper_wallet(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deduct_helper_wallet(uuid, numeric, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_coins_to_user(uuid, uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.exchange_user_beans_to_diamonds(uuid, integer, integer, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.exchange_agency_beans_to_diamonds(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_user_beans_exchange(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.safe_credit_diamonds(uuid, integer, text, text, text, numeric, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coin_trader_self_recharge(bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coin_trader_transfer_to_agency(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.coin_trader_transfer_to_user(uuid, bigint) FROM PUBLIC, anon;
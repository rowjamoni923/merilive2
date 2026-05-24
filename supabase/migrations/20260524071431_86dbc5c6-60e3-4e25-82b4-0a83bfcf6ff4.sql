-- =====================================================================
-- Section #7 Wallet & Coin Ledger — deep audit hardening
-- Fixes critical exploits where any authenticated/anon caller could
-- mint coins, drain other users' wallets, or bypass balance protections.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Lock internal credit helpers — only callable from server side
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._internal_add_coins(uuid, integer)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._internal_add_beans(uuid, integer)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._internal_add_diamonds(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._internal_add_diamonds(uuid, bigint)  FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Fix `_internal_add_diamonds(uuid, bigint)` — wrong column (coins)
--    + ensure it can only run inside SECURITY DEFINER chains.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._internal_add_diamonds(_user_id uuid, _amount bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _amount <= 0 THEN RETURN; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _amount WHERE id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._internal_add_diamonds(uuid, bigint) FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) `safe_credit_diamonds` — was open to anon/authenticated; anyone
--    could mint unlimited coins. Restrict to service_role / admin.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_gateway text DEFAULT 'auto',
  p_order_id text DEFAULT NULL,
  p_transaction_id text DEFAULT NULL,
  p_amount_usd numeric DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
  _payment_ref text;
  _inserted_id uuid;
  _is_service boolean;
BEGIN
  _is_service := COALESCE(auth.role(), '') = 'service_role'
                 OR (auth.uid() IS NULL AND public.current_admin_id_from_header() IS NULL);
  IF NOT _is_service
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: safe_credit_diamonds requires service or admin context';
  END IF;

  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  _payment_ref := COALESCE(p_order_id, '') || ':' || COALESCE(p_transaction_id, '');
  IF _payment_ref = ':' THEN
    _payment_ref := p_gateway || ':' || p_user_id::text || ':' || p_amount::text || ':' || extract(epoch from clock_timestamp())::text;
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
END;
$$;
REVOKE EXECUTE ON FUNCTION public.safe_credit_diamonds(uuid, integer, text, text, text, numeric, jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) `transfer_coins_to_user` — added missing sender-identity check
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_coins_to_user(
  _sender_id uuid, _receiver_id uuid, _amount integer, _note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  UPDATE profiles SET coins = coins - _amount WHERE id = _sender_id AND coins >= _amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id;
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, notes)
  VALUES (_sender_id, _receiver_id, _amount, _note);
  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Deduct functions — must be self/admin/service; cannot drain others
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_coins(p_user_id uuid, p_amount integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _current integer; _new integer;
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

  SELECT coins INTO _current FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF _current IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  IF _current < p_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  _new := _current - p_amount;
  UPDATE profiles SET coins = _new WHERE id = p_user_id;
  RETURN json_build_object('success', true, 'new_balance', _new);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(p_user_id uuid, p_amount integer, p_reason text DEFAULT 'deduction')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cur bigint; v_new bigint; v_amt bigint;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct from another user';
  END IF;

  v_amt := GREATEST(0, p_amount::bigint);
  SELECT coins INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF v_cur < v_amt THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_cur); END IF;
  v_new := v_cur - v_amt;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET coins = v_new, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(p_user_id uuid, p_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cur bigint; v_new bigint;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: cannot deduct from another user';
  END IF;

  SELECT coins INTO v_cur FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF v_cur < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_cur); END IF;
  v_new := v_cur - p_amount;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = v_new WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true, 'new_balance', v_new);
END;
$$;

-- Drop the ambiguous one-line wrapper so JS rpc calls resolve cleanly to the
-- 3-arg variant. The bigint overload still serves callers that pass bigint.
DROP FUNCTION IF EXISTS public.deduct_coins_atomic(uuid, integer);

-- ---------------------------------------------------------------------
-- 6) Tighten legacy `add_coins(p_user_id, p_amount)` so anon cannot reach it
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_coins(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result_balance integer;
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
  UPDATE profiles SET coins = coins + p_amount WHERE id = p_user_id RETURNING coins INTO result_balance;
  IF result_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
END;
$$;
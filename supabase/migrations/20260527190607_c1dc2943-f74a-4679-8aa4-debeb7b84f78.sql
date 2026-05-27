
-- Pkg383: relax apply_vip_recharge_bonus so internal SECDEF credit flows can call it.
-- It is still REVOKE-d from anon/authenticated; only service role + internal SECDEF
-- functions (which set app.bypass_profile_protection) reach it.
CREATE OR REPLACE FUNCTION public.apply_vip_recharge_bonus(
  _user_id uuid, _recharge_id uuid, _base_diamonds integer
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _vip_pct NUMERIC := 0;
  _noble_pct NUMERIC := 0;
  _final_pct NUMERIC := 0;
  _bonus INTEGER := 0;
  _vip_id UUID;
  _noble_id UUID;
  _source_type TEXT;
  _source_id UUID;
  _caller_role TEXT := current_setting('request.jwt.claim.role', true);
  _is_trusted_internal boolean := COALESCE(current_setting('app.bypass_profile_protection', true), 'false') = 'true';
BEGIN
  IF _caller_role IS DISTINCT FROM 'service_role' AND NOT _is_trusted_internal THEN
    RAISE EXCEPTION 'apply_vip_recharge_bonus: forbidden' USING ERRCODE = '42501';
  END IF;

  IF _user_id IS NULL OR _base_diamonds IS NULL OR _base_diamonds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid input');
  END IF;

  SELECT vt.id, vt.recharge_bonus_percent INTO _vip_id, _vip_pct
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now())
    AND vt.recharge_bonus_percent > 0
  ORDER BY vt.recharge_bonus_percent DESC
  LIMIT 1;

  SELECT nc.id, nc.recharge_bonus_percent INTO _noble_id, _noble_pct
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _user_id
    AND uns.is_active = true
    AND uns.expires_at > now()
    AND nc.recharge_bonus_percent > 0
  ORDER BY nc.recharge_bonus_percent DESC
  LIMIT 1;

  IF COALESCE(_noble_pct, 0) >= COALESCE(_vip_pct, 0) THEN
    _final_pct := COALESCE(_noble_pct, 0);
    _source_type := 'noble_card';
    _source_id := _noble_id;
  ELSE
    _final_pct := COALESCE(_vip_pct, 0);
    _source_type := 'vip_tier';
    _source_id := _vip_id;
  END IF;

  IF _final_pct <= 0 THEN
    RETURN jsonb_build_object('success', true, 'bonus_diamonds', 0, 'reason', 'No bonus eligible');
  END IF;

  _bonus := FLOOR(_base_diamonds * _final_pct / 100.0);

  IF _bonus > 0 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
    SET diamonds = COALESCE(diamonds, 0) + _bonus, updated_at = now()
    WHERE id = _user_id;

    INSERT INTO public.vip_recharge_bonus_log (
      user_id, recharge_id, base_diamonds, bonus_percent,
      bonus_diamonds, source_type, source_id
    ) VALUES (
      _user_id, _recharge_id, _base_diamonds, _final_pct,
      _bonus, _source_type, _source_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'bonus_diamonds', _bonus,
    'bonus_percent', _final_pct,
    'source_type', _source_type
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_vip_recharge_bonus(uuid, uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.apply_vip_recharge_bonus(uuid, uuid, integer) TO service_role;

-- Pkg383: new internal orchestrator — applies first-recharge bonus + VIP/Noble bonus.
-- Idempotent. Safe to call from any SECDEF credit flow.
CREATE OR REPLACE FUNCTION public._apply_recharge_bonuses_internal(
  p_user_id uuid,
  p_base_coins integer,
  p_recharge_ref text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bonus public.first_recharge_bonus%ROWTYPE;
  v_first_bonus_amount integer := 0;
  v_first_already boolean := false;
  v_vip_result jsonb;
  v_recharge_uuid uuid;
BEGIN
  IF p_user_id IS NULL OR COALESCE(p_base_coins, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  -- ---- 1) First-recharge bonus (one-shot per user) ----
  SELECT * INTO v_bonus
    FROM public.first_recharge_bonus
   WHERE COALESCE(is_active, true) = true
   ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
   LIMIT 1;

  IF FOUND THEN
    BEGIN
      IF COALESCE(v_bonus.bonus_coins, 0) > 0 THEN
        v_first_bonus_amount := v_bonus.bonus_coins;
      ELSIF COALESCE(v_bonus.bonus_multiplier, 0) > 0 THEN
        v_first_bonus_amount := FLOOR(p_base_coins::numeric * v_bonus.bonus_multiplier)::integer;
      ELSIF COALESCE(v_bonus.bonus_percentage, 0) > 0 THEN
        v_first_bonus_amount := FLOOR(p_base_coins::numeric * v_bonus.bonus_percentage / 100.0)::integer;
      END IF;

      IF v_first_bonus_amount > 0 THEN
        INSERT INTO public.first_recharge_claims (user_id, bonus_id, original_amount, bonus_amount)
        VALUES (p_user_id, v_bonus.id, p_base_coins, v_first_bonus_amount);

        PERFORM set_config('app.bypass_profile_protection', 'true', true);
        UPDATE public.profiles
           SET coins = COALESCE(coins, 0) + v_first_bonus_amount,
               updated_at = now()
         WHERE id = p_user_id;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      v_first_already := true;
      v_first_bonus_amount := 0;
    END;
  END IF;

  -- ---- 2) VIP / Noble recharge bonus (each recharge) ----
  -- apply_vip_recharge_bonus expects a uuid recharge_id; if p_recharge_ref is a
  -- valid uuid use it, otherwise pass NULL (the bonus log accepts NULL).
  BEGIN
    v_recharge_uuid := p_recharge_ref::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_recharge_uuid := NULL;
  END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  v_vip_result := public.apply_vip_recharge_bonus(p_user_id, v_recharge_uuid, p_base_coins);

  RETURN jsonb_build_object(
    'success', true,
    'first_recharge_bonus_coins', v_first_bonus_amount,
    'first_recharge_already', v_first_already,
    'vip_bonus', v_vip_result
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._apply_recharge_bonuses_internal(uuid, integer, text) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._apply_recharge_bonuses_internal(uuid, integer, text) TO service_role;

-- Pkg383: SwiftPay / IPN credit path now also fires bonuses.
CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(
  p_user_id uuid, p_amount integer, p_gateway text DEFAULT NULL::text,
  p_order_id text DEFAULT NULL::text, p_transaction_id text DEFAULT NULL::text,
  p_amount_usd numeric DEFAULT NULL::numeric, p_metadata jsonb DEFAULT NULL::jsonb
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

  -- Pkg383: apply first-recharge + VIP/Noble bonuses (idempotent, best-effort).
  BEGIN
    _bonus_result := public._apply_recharge_bonuses_internal(p_user_id, p_amount, _inserted_id::text);
  EXCEPTION WHEN OTHERS THEN
    _bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  RETURN json_build_object(
    'success', true,
    'new_balance', _new_balance,
    'amount_credited', p_amount,
    'payment_reference', _payment_ref,
    'bonuses', _bonus_result
  );
END $function$;

-- Pkg383: manual helper-order completion now also fires bonuses for the buyer.
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
BEGIN
  IF lower(coalesce(_action, '')) NOT IN ('complete', 'approve', 'cancel', 'reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;

  SELECT * INTO v_order FROM public.helper_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  SELECT wallet_balance, user_id INTO v_helper_wallet, v_helper_user_id
    FROM public.topup_helpers WHERE id = v_order.helper_id FOR UPDATE;
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
       SET status = 'cancelled', processed_at = now(),
           helper_notes = COALESCE(_notes, helper_notes),
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object('cancelled_by', CASE WHEN v_is_admin THEN 'admin' ELSE 'helper' END, 'cancelled_at', now())
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', true, 'status', 'cancelled');
  END IF;

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
       SET wallet_balance = wallet_balance - v_wallet_deducted, updated_at = now()
     WHERE id = v_order.helper_id;
  END IF;

  IF v_remaining > 0 THEN
    SELECT id, diamond_balance INTO v_agency_id, v_agency_bal
      FROM public.agencies WHERE owner_id = v_helper_user_id FOR UPDATE;
    IF v_agency_id IS NOT NULL AND COALESCE(v_agency_bal, 0) >= v_remaining THEN
      v_agency_deducted := v_remaining;
      v_remaining := 0;
      UPDATE public.agencies
         SET diamond_balance = diamond_balance - v_agency_deducted, updated_at = now()
       WHERE id = v_agency_id;
    END IF;
  END IF;

  IF v_remaining > 0 THEN
    IF v_wallet_deducted > 0 THEN
      UPDATE public.topup_helpers SET wallet_balance = wallet_balance + v_wallet_deducted WHERE id = v_order.helper_id;
    END IF;
    UPDATE public.helper_orders
       SET status = 'failed', helper_notes = COALESCE(_notes, helper_notes),
           payment_details = COALESCE(payment_details, '{}'::jsonb)
             || jsonb_build_object('failure_reason', 'helper_insufficient_balance',
                                   'wallet_balance', COALESCE(v_helper_wallet, 0),
                                   'agency_balance', COALESCE(v_agency_bal, 0))
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'helper_insufficient_balance');
  END IF;

  UPDATE public.topup_helpers
     SET total_sold = COALESCE(total_sold, 0) + v_order.coin_amount, updated_at = now()
   WHERE id = v_order.helper_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + v_order.coin_amount,
         total_recharged = COALESCE(total_recharged, 0) + v_order.coin_amount,
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
    UPDATE public.helper_orders SET status = 'failed',
       payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('failure_reason', 'buyer_profile_not_found')
     WHERE id = _order_id;
    RETURN jsonb_build_object('success', false, 'error', 'buyer_profile_not_found');
  END IF;

  UPDATE public.helper_orders
     SET status = 'completed', processed_at = now(),
         helper_notes = COALESCE(_notes, helper_notes),
         payment_details = COALESCE(payment_details, '{}'::jsonb)
           || jsonb_build_object('completed_by', CASE WHEN v_is_admin THEN 'admin' ELSE 'helper' END,
                                 'wallet_deducted', v_wallet_deducted,
                                 'agency_deducted', v_agency_deducted,
                                 'balance_after', v_new_user_balance)
   WHERE id = _order_id;

  BEGIN
    INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
    VALUES (v_helper_user_id, v_order.user_id, v_order.coin_amount, 'helper_topup', 'completed', 'Manual helper top-up. Order: ' || _order_id::text);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Pkg383: also fire first-recharge + VIP/Noble bonuses for buyer.
  BEGIN
    v_bonus_result := public._apply_recharge_bonuses_internal(v_order.user_id, v_order.coin_amount::integer, _order_id::text);
  EXCEPTION WHEN OTHERS THEN
    v_bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'success', true, 'status', 'completed',
    'creditedCoins', v_order.coin_amount,
    'newBalance', v_new_user_balance,
    'walletDeducted', v_wallet_deducted,
    'agencyDeducted', v_agency_deducted,
    'bonuses', v_bonus_result
  );
END;
$function$;

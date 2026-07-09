CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(p_user_id uuid, p_amount integer, p_gateway text DEFAULT NULL::text, p_order_id text DEFAULT NULL::text, p_transaction_id text DEFAULT NULL::text, p_amount_usd numeric DEFAULT NULL::numeric, p_metadata jsonb DEFAULT NULL::jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  PERFORM set_config('app.wallet_ctx', jsonb_build_object(
    'source_type', 'safe_credit_diamonds',
    'source_id', COALESCE(p_order_id, p_transaction_id, _payment_ref),
    'source_table', 'coin_transactions',
    'payment_method', COALESCE(p_gateway, 'unknown'),
    'payment_reference', _payment_ref,
    'amount_usd', p_amount_usd,
    'metadata', COALESCE(p_metadata, '{}'::jsonb)
  )::text, true);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  BEGIN
    INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
    VALUES (p_user_id, p_amount, 'recharge', p_gateway, _payment_ref, 'completed', 'order:' || COALESCE(p_order_id, 'N/A') || ' txn:' || COALESCE(p_transaction_id, 'N/A'))
    RETURNING id INTO _inserted_id;
  EXCEPTION WHEN unique_violation THEN
    _invite_result := public.qualify_invitation_after_purchase(p_user_id, p_amount_usd, p_amount, p_gateway, _payment_ref);
    SELECT COALESCE(coins, 0) INTO _new_balance FROM public.profiles WHERE id = p_user_id;
    RETURN json_build_object('success', true, 'already_credited', true, 'new_balance', COALESCE(_new_balance, 0), 'payment_reference', _payment_ref, 'invitation', _invite_result);
  END;

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + p_amount,
         total_recharged = COALESCE(total_recharged, 0) + p_amount,
         updated_at = now()
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

  IF COALESCE(p_gateway, '') <> 'google_play' THEN
    BEGIN
      INSERT INTO public.recharge_transactions (
        user_id, order_id, payment_method, amount, coins_amount, bonus_coins,
        status, processed_at, created_at, updated_at, currency, usd_amount,
        coins_received, completed_at, currency_code, notes, purchase_source, transaction_id
      ) VALUES (
        p_user_id, p_order_id, COALESCE(p_gateway, 'unknown'), COALESCE(p_amount_usd, 0), p_amount, 0,
        'completed', now(), now(), now(), 'USD', p_amount_usd,
        p_amount, now(), 'USD',
        'Auto-canonicalized from safe_credit_diamonds. Ref: ' || _payment_ref,
        COALESCE(p_gateway, 'unknown'), COALESCE(p_transaction_id, p_order_id, _payment_ref)
      );
    EXCEPTION WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN NULL;
    END;
  END IF;

  BEGIN
    _bonus_result := public._apply_recharge_bonuses_internal(p_user_id, p_amount, _inserted_id::text);
    SELECT COALESCE(coins, 0) INTO _new_balance FROM public.profiles WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    _bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;

  _invite_result := public.qualify_invitation_after_purchase(p_user_id, p_amount_usd, p_amount, p_gateway, _payment_ref);

  RETURN json_build_object('success', true, 'new_balance', _new_balance, 'amount_credited', p_amount, 'payment_reference', _payment_ref, 'bonuses', _bonus_result, 'invitation', _invite_result);
END;
$$;
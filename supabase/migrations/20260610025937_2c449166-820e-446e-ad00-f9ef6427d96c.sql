CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(_user_id uuid, _amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  helper_rec RECORD;
  helper_balance_before bigint := 0;
  helper_balance_after  bigint := 0;
  new_coins bigint;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.calling_function', 'helper_transfer_diamonds_to_self', true);

  IF NOT public.check_topup_trader_gate(
       _user_id,
       'helper_transfer_diamonds_to_self',
       jsonb_build_object('kind','self'),
       _amount
     ) THEN
    IF auth.uid() IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized sender');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Trader Wallet source = helper wallet ONLY (no agency diamond_balance merge)
  SELECT id, COALESCE(wallet_balance, 0)::bigint AS wallet_balance
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

  helper_balance_before := helper_rec.wallet_balance;

  IF helper_balance_before < _amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient trader wallet balance',
      'available', helper_balance_before,
      'requested', _amount
    );
  END IF;

  helper_balance_after := helper_balance_before - _amount;

  UPDATE public.topup_helpers
     SET wallet_balance = helper_balance_after, updated_at = now()
   WHERE id = helper_rec.id;

  INSERT INTO public.helper_transactions (
    helper_id, transaction_type, amount, balance_before, balance_after,
    reference_id, description, user_id, status, created_at
  ) VALUES (
    helper_rec.id, 'self_recharge_debit', -_amount,
    helper_balance_before::integer, helper_balance_after::integer,
    _user_id, 'Trader wallet self recharge debit', _user_id, 'completed', now()
  );

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + _amount, updated_at = now()
   WHERE id = _user_id
  RETURNING coins INTO new_coins;

  INSERT INTO public.coin_transactions (
    user_id, amount, transaction_type, description, reference_id, created_at
  ) VALUES (
    _user_id, _amount, 'self_recharge',
    'Self recharge from trader (helper) wallet', helper_rec.id, now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'source', 'helper_wallet',
    'helper_balance_before', helper_balance_before,
    'helper_balance_after', helper_balance_after,
    'recharged_amount', _amount,
    'new_coin_balance', new_coins
  );
END;
$function$;
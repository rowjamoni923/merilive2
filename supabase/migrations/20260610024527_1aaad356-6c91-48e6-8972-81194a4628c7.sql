CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(_user_id uuid, _amount bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  helper_rec RECORD;
  agency_rec RECORD;
  helper_balance_before bigint := 0;
  helper_balance_after  bigint := 0;
  agency_balance_before bigint := 0;
  agency_balance_after  bigint := 0;
  total_available bigint := 0;
  remaining bigint;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
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

  -- Trader Wallet = helper_wallet + agency.diamond_balance (same source as top-up & agency transfer)
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

  SELECT id, COALESCE(diamond_balance, 0)::bigint AS diamond_balance
    INTO agency_rec
    FROM public.agencies
   WHERE owner_id = _user_id
     AND COALESCE(is_active, true) = true
     AND COALESCE(is_blocked, false) = false
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;

  total_available := COALESCE(helper_rec.wallet_balance, 0) + COALESCE(agency_rec.diamond_balance, 0);

  IF total_available < _amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient trader wallet balance',
      'available', total_available,
      'requested', _amount
    );
  END IF;

  remaining := _amount;

  -- Draw from helper wallet first, then agency diamond_balance
  IF helper_rec.id IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
    helper_balance_before := helper_rec.wallet_balance;
    helper_deducted := LEAST(remaining, helper_balance_before);
    helper_balance_after := helper_balance_before - helper_deducted;

    UPDATE public.topup_helpers
       SET wallet_balance = helper_balance_after, updated_at = now()
     WHERE id = helper_rec.id;

    INSERT INTO public.helper_transactions (
      helper_id, transaction_type, amount, balance_before, balance_after,
      reference_id, description, user_id, status, created_at
    ) VALUES (
      helper_rec.id, 'self_recharge_debit', -helper_deducted,
      helper_balance_before::integer, helper_balance_after::integer,
      _user_id, 'Trader wallet self recharge debit (helper wallet)', _user_id, 'completed', now()
    );

    remaining := remaining - helper_deducted;
  END IF;

  IF agency_rec.id IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
    agency_balance_before := agency_rec.diamond_balance;
    agency_deducted := LEAST(remaining, agency_balance_before);
    agency_balance_after := agency_balance_before - agency_deducted;

    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);

    UPDATE public.agencies
       SET diamond_balance = agency_balance_after, updated_at = now()
     WHERE id = agency_rec.id;

    INSERT INTO public.agency_diamond_transactions (
      agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id
    ) VALUES (
      agency_rec.id, 'trader_self_recharge_out', 0, agency_deducted, 0, _user_id
    );

    remaining := remaining - agency_deducted;
  END IF;

  IF remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Internal allocation error', 'remaining', remaining);
  END IF;

  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + _amount
   WHERE id = _user_id
   RETURNING coins INTO new_coins;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes)
  VALUES (_user_id, _amount, 'self_recharge', 'completed', 'Trader wallet self recharge');

  RETURN jsonb_build_object(
    'success', true,
    'helper_deducted', helper_deducted,
    'agency_deducted', agency_deducted,
    'new_coins', new_coins,
    'new_wallet_balance', COALESCE(helper_balance_after, COALESCE(helper_rec.wallet_balance, 0)) + COALESCE(agency_balance_after, COALESCE(agency_rec.diamond_balance, 0)),
    'source', CASE
      WHEN helper_deducted > 0 AND agency_deducted > 0 THEN 'helper_wallet+agency_diamond'
      WHEN agency_deducted > 0 THEN 'agency_diamond'
      ELSE 'helper_wallet'
    END
  );
END;
$function$;
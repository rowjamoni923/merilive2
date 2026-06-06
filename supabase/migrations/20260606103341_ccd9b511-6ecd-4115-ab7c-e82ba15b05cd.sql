
-- Pkg429: CRITICAL financial isolation fix.
-- helper_transfer_diamonds_to_self was draining BOTH topup_helpers.wallet_balance
-- AND agencies.diamond_balance to credit personal profiles.coins (My Diamond).
-- That violated the stated economy rule:
--   "Trader Wallet কখনো My Diamond এর balance টাকে কখনোই যুক্ত করবে না"
-- Agency diamond_balance belongs to the agency pool (host top-ups, agency-to-agency
-- transfers, gift recycling) — NOT a shortcut for the owner to siphon agency funds
-- into personal coins, bypassing the withdrawal + commission + audit flow.
--
-- Fix: self-recharge may ONLY debit the trader's own topup_helpers.wallet_balance.
-- Agency owner who wants personal cash must use the proper agency_withdrawals flow.

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

  -- Pkg429: ONLY draw from trader's own helper wallet. NO agency diamond_balance fallback.
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

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Trader wallet not found');
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
    'helper_deducted', _amount,
    'agency_deducted', 0,
    'new_coins', new_coins,
    'new_wallet_balance', helper_balance_after,
    'source', 'trader_wallet_only'
  );
END;
$function$;

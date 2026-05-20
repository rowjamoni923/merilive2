CREATE OR REPLACE FUNCTION public.is_approved_topup_trader(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.topup_helpers
    WHERE user_id = _user_id
      AND COALESCE(is_active, true) = true
      AND COALESCE(is_verified, false) = true
      AND COALESCE(trader_level, 0) BETWEEN 1 AND 5
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_approved_topup_trader(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.coin_trader_transfer_to_user(recipient_uid uuid, amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF NOT public.is_approved_topup_trader(me) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;
  RETURN public.helper_transfer_coins_to_user(me, recipient_uid, amount, 'trader_to_user');
END; $$;
REVOKE ALL ON FUNCTION public.coin_trader_transfer_to_user(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coin_trader_transfer_to_user(uuid, bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.coin_trader_transfer_to_agency(target_agency_id uuid, amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); j jsonb;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF NOT public.is_approved_topup_trader(me) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;
  j := public.helper_transfer_diamonds_to_agency(me, target_agency_id, amount, 'trader_to_agency');
  IF COALESCE((j->>'success')::boolean, false) THEN
    INSERT INTO public.coin_trader_transfers (user_id, counterparty_agency_id, amount, transfer_type, status)
    VALUES (me, target_agency_id, amount, 'to_agency', 'completed');
  END IF;
  RETURN j;
END; $$;
REVOKE ALL ON FUNCTION public.coin_trader_transfer_to_agency(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coin_trader_transfer_to_agency(uuid, bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.coin_trader_self_recharge(amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF NOT public.is_approved_topup_trader(me) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;
  RETURN public.helper_transfer_diamonds_to_self(me, amount);
END; $$;
REVOKE ALL ON FUNCTION public.coin_trader_self_recharge(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coin_trader_self_recharge(bigint) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(_user_id uuid, _amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  helper_rec RECORD; agency_rec RECORD; profile_agency_id uuid;
  remaining bigint; helper_deducted bigint := 0; agency_deducted bigint := 0;
  new_wallet bigint; new_coins bigint;
BEGIN
  IF _amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive'); END IF;
  IF NOT public.is_approved_topup_trader(_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can top up');
  END IF;

  SELECT id, wallet_balance INTO helper_rec FROM topup_helpers
  WHERE user_id = _user_id AND COALESCE(is_active, true) = true AND COALESCE(is_verified, false) = true
    AND COALESCE(trader_level, 0) BETWEEN 1 AND 5
  ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;

  SELECT p.agency_id INTO profile_agency_id FROM profiles p WHERE p.id = _user_id;
  IF profile_agency_id IS NOT NULL THEN
    SELECT id, diamond_balance INTO agency_rec FROM agencies
    WHERE id = profile_agency_id AND COALESCE(is_active, true) = true FOR UPDATE;
  END IF;
  IF agency_rec IS NULL THEN
    SELECT id, diamond_balance INTO agency_rec FROM agencies
    WHERE owner_id = _user_id AND COALESCE(is_active, true) = true
    ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  END IF;

  remaining := _amount;
  IF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
    agency_deducted := LEAST(remaining, agency_rec.diamond_balance::bigint);
    UPDATE agencies SET diamond_balance = diamond_balance - agency_deducted, updated_at = now() WHERE id = agency_rec.id;
    remaining := remaining - agency_deducted;
  END IF;
  IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
    helper_deducted := LEAST(remaining, helper_rec.wallet_balance::bigint);
    UPDATE topup_helpers SET wallet_balance = wallet_balance - helper_deducted, updated_at = now() WHERE id = helper_rec.id;
    remaining := remaining - helper_deducted;
  END IF;
  IF remaining > 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance'); END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id RETURNING coins INTO new_coins;
  IF helper_rec IS NOT NULL THEN
    SELECT wallet_balance INTO new_wallet FROM topup_helpers WHERE id = helper_rec.id;
  ELSE new_wallet := 0; END IF;

  INSERT INTO coin_transactions (user_id, coins_amount, transaction_type, status, notes)
  VALUES (_user_id, _amount, 'self_recharge', 'completed', 'Helper self recharge');

  RETURN jsonb_build_object('success', true,
    'new_wallet_balance', COALESCE(new_wallet, 0),
    'new_coins', COALESCE(new_coins, 0),
    'helper_deducted', helper_deducted,
    'agency_deducted', agency_deducted);
END; $$;
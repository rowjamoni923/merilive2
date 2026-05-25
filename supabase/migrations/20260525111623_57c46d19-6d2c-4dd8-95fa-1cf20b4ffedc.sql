-- Pkg333 Trader Wallet pass-2: complete ledger + payroll assignment hardening

CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(_user_id uuid, _amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  helper_rec RECORD;
  agency_rec RECORD;
  remaining bigint;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  total_available bigint := 0;
  new_wallet bigint;
  new_coins bigint;
  helper_balance_before bigint := 0;
  helper_balance_after bigint := 0;
  agency_balance_before bigint := 0;
  agency_balance_after bigint := 0;
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

  SELECT id, wallet_balance INTO helper_rec
  FROM public.topup_helpers
  WHERE user_id = _user_id AND COALESCE(is_active, true) = true AND COALESCE(is_verified, false) = true
    AND COALESCE(trader_level, 0) BETWEEN 1 AND 5
  ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;

  SELECT id, diamond_balance INTO agency_rec
  FROM public.agencies
  WHERE owner_id = _user_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false
  ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;

  total_available := COALESCE(helper_rec.wallet_balance, 0)::bigint + COALESCE(agency_rec.diamond_balance, 0)::bigint;
  IF total_available < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'available', total_available);
  END IF;

  remaining := _amount;
  IF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
    agency_balance_before := COALESCE(agency_rec.diamond_balance, 0)::bigint;
    agency_deducted := LEAST(remaining, agency_balance_before);
    agency_balance_after := agency_balance_before - agency_deducted;
    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
    UPDATE public.agencies SET diamond_balance = agency_balance_after, updated_at = now() WHERE id = agency_rec.id;
    INSERT INTO public.agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id)
    VALUES (agency_rec.id, 'trader_self_recharge_out', 0, agency_deducted, 0, _user_id);
    remaining := remaining - agency_deducted;
  END IF;

  IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
    helper_balance_before := COALESCE(helper_rec.wallet_balance, 0)::bigint;
    helper_deducted := LEAST(remaining, helper_balance_before);
    helper_balance_after := helper_balance_before - helper_deducted;
    UPDATE public.topup_helpers SET wallet_balance = helper_balance_after, updated_at = now() WHERE id = helper_rec.id;
    INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
    VALUES (helper_rec.id, 'self_recharge_debit', -helper_deducted, helper_balance_before::integer, helper_balance_after::integer, _user_id, 'Trader wallet self recharge debit', _user_id);
    remaining := remaining - helper_deducted;
  END IF;

  UPDATE public.profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id RETURNING coins INTO new_coins;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;

  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes)
  VALUES (_user_id, _amount, 'self_recharge', 'completed', 'Trader wallet self recharge');

  IF helper_rec IS NOT NULL THEN SELECT wallet_balance::bigint INTO new_wallet FROM public.topup_helpers WHERE id = helper_rec.id; END IF;

  RETURN jsonb_build_object(
    'success', true,
    'helper_deducted', helper_deducted,
    'agency_deducted', agency_deducted,
    'new_coins', new_coins,
    'new_wallet_balance', new_wallet,
    'new_agency_balance', CASE WHEN agency_rec IS NOT NULL THEN (SELECT diamond_balance FROM public.agencies WHERE id = agency_rec.id) ELSE NULL END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.helper_transfer_coins_to_user(_sender_id uuid, _receiver_id uuid, _amount bigint, _sender_type text DEFAULT 'trader_to_user'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  helper_rec RECORD;
  agency_rec RECORD;
  remaining bigint;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  user_deducted bigint := 0;
  total_available bigint := 0;
  new_receiver_coins bigint;
  sender_coins bigint;
  v_sender_name text;
  helper_balance_before bigint := 0;
  helper_balance_after bigint := 0;
  agency_balance_before bigint := 0;
  agency_balance_after bigint := 0;
BEGIN
  PERFORM set_config('app.calling_function', 'helper_transfer_coins_to_user', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF NOT public.check_topup_trader_gate(
       _sender_id,
       'helper_transfer_coins_to_user',
       jsonb_build_object('kind','user','receiver_id', _receiver_id, 'sender_type', _sender_type),
       _amount
     ) THEN
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can transfer');
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> _sender_id THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized sender'); END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive'); END IF;
  IF _sender_id = _receiver_id THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself'); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _receiver_id AND COALESCE(is_banned, false) = false AND COALESCE(is_deleted, false) = false AND COALESCE(is_blocked, false) = false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receiver not found or unavailable');
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_users WHERE (blocker_id = _sender_id AND blocked_id = _receiver_id) OR (blocker_id = _receiver_id AND blocked_id = _sender_id)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transfer blocked between these users');
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), app_uid, 'Trader') INTO v_sender_name FROM public.profiles WHERE id = _sender_id;
  SELECT id, wallet_balance INTO helper_rec FROM public.topup_helpers WHERE user_id = _sender_id AND COALESCE(is_active, true) = true AND COALESCE(is_verified, false) = true AND COALESCE(trader_level, 0) BETWEEN 1 AND 5 ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  SELECT id, diamond_balance INTO agency_rec FROM public.agencies WHERE owner_id = _sender_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  SELECT coins INTO sender_coins FROM public.profiles WHERE id = _sender_id FOR UPDATE;

  total_available := COALESCE(sender_coins, 0)::bigint + COALESCE(helper_rec.wallet_balance, 0)::bigint + COALESCE(agency_rec.diamond_balance, 0)::bigint;
  IF total_available < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'available', total_available);
  END IF;

  remaining := _amount;
  IF COALESCE(_sender_type, '') LIKE 'agency%' THEN
    IF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
      agency_balance_before := COALESCE(agency_rec.diamond_balance, 0)::bigint;
      agency_deducted := LEAST(remaining, agency_balance_before);
      agency_balance_after := agency_balance_before - agency_deducted;
      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies SET diamond_balance = agency_balance_after, updated_at = now() WHERE id = agency_rec.id;
      INSERT INTO public.agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id)
      VALUES (agency_rec.id, 'trader_transfer_to_user_out', 0, agency_deducted, 0, _receiver_id);
      remaining := remaining - agency_deducted;
    END IF;
    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
      helper_balance_before := COALESCE(helper_rec.wallet_balance, 0)::bigint;
      helper_deducted := LEAST(remaining, helper_balance_before);
      helper_balance_after := helper_balance_before - helper_deducted;
      UPDATE public.topup_helpers SET wallet_balance = helper_balance_after, updated_at = now() WHERE id = helper_rec.id;
      INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
      VALUES (helper_rec.id, 'transfer_to_user_debit', -helper_deducted, helper_balance_before::integer, helper_balance_after::integer, _receiver_id, 'Trader wallet transfer to user debit', _sender_id);
      remaining := remaining - helper_deducted;
    END IF;
  ELSE
    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
      helper_balance_before := COALESCE(helper_rec.wallet_balance, 0)::bigint;
      helper_deducted := LEAST(remaining, helper_balance_before);
      helper_balance_after := helper_balance_before - helper_deducted;
      UPDATE public.topup_helpers SET wallet_balance = helper_balance_after, updated_at = now() WHERE id = helper_rec.id;
      INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
      VALUES (helper_rec.id, 'transfer_to_user_debit', -helper_deducted, helper_balance_before::integer, helper_balance_after::integer, _receiver_id, 'Trader wallet transfer to user debit', _sender_id);
      remaining := remaining - helper_deducted;
    END IF;
    IF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
      agency_balance_before := COALESCE(agency_rec.diamond_balance, 0)::bigint;
      agency_deducted := LEAST(remaining, agency_balance_before);
      agency_balance_after := agency_balance_before - agency_deducted;
      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies SET diamond_balance = agency_balance_after, updated_at = now() WHERE id = agency_rec.id;
      INSERT INTO public.agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id)
      VALUES (agency_rec.id, 'trader_transfer_to_user_out', 0, agency_deducted, 0, _receiver_id);
      remaining := remaining - agency_deducted;
    END IF;
  END IF;

  IF remaining > 0 AND COALESCE(sender_coins, 0) > 0 THEN
    user_deducted := LEAST(remaining, sender_coins);
    UPDATE public.profiles SET coins = COALESCE(coins, 0) - user_deducted WHERE id = _sender_id;
  END IF;

  UPDATE public.profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id RETURNING coins INTO new_receiver_coins;
  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes) VALUES (_sender_id, _amount, 'transfer_out', 'completed', 'Transfer to user ' || _receiver_id::text);
  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes) VALUES (_receiver_id, _amount, 'transfer_in', 'completed', 'Transfer from ' || _sender_id::text);
  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes) VALUES (_sender_id, _receiver_id, _amount, _sender_type, 'completed', 'Trader wallet transfer to user');
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at) VALUES (_receiver_id, 'coins_received', 'Diamonds Received', _amount::text || ' diamonds received from ' || COALESCE(v_sender_name, 'Trader'), jsonb_build_object('sender_id', _sender_id, 'amount', _amount, 'source', _sender_type, 'action_url', '/recharge-history'), false, now());
  RETURN jsonb_build_object('success', true, 'helper_deducted', helper_deducted, 'agency_deducted', agency_deducted, 'user_deducted', user_deducted, 'new_receiver_coins', new_receiver_coins);
END;
$function$;

CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_agency(_sender_id uuid, _target_agency_id uuid, _amount bigint, _sender_type text DEFAULT 'trader_to_agency'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  helper_rec RECORD;
  sender_agency_rec RECORD;
  target_agency_rec RECORD;
  remaining bigint;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  user_deducted bigint := 0;
  total_available bigint := 0;
  sender_coins bigint;
  new_target_balance bigint;
  v_sender_name text;
  helper_balance_before bigint := 0;
  helper_balance_after bigint := 0;
  agency_balance_before bigint := 0;
  agency_balance_after bigint := 0;
BEGIN
  PERFORM set_config('app.calling_function', 'helper_transfer_diamonds_to_agency', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF NOT public.check_topup_trader_gate(
       _sender_id,
       'helper_transfer_diamonds_to_agency',
       jsonb_build_object('kind','agency','agency_id', _target_agency_id, 'sender_type', _sender_type),
       _amount
     ) THEN
    IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Only approved L1-L5 helper traders can transfer');
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> _sender_id THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized sender'); END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive'); END IF;

  SELECT COALESCE(NULLIF(display_name, ''), app_uid, 'Trader') INTO v_sender_name FROM public.profiles WHERE id = _sender_id;
  SELECT id, owner_id, diamond_balance, name INTO target_agency_rec FROM public.agencies WHERE id = _target_agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false FOR UPDATE;
  IF target_agency_rec IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Target agency not found'); END IF;
  IF target_agency_rec.owner_id = _sender_id THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to your own agency from this screen'); END IF;

  SELECT id, wallet_balance INTO helper_rec FROM public.topup_helpers WHERE user_id = _sender_id AND COALESCE(is_active, true) = true AND COALESCE(is_verified, false) = true AND COALESCE(trader_level, 0) BETWEEN 1 AND 5 ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  SELECT id, diamond_balance INTO sender_agency_rec FROM public.agencies WHERE owner_id = _sender_id AND id <> _target_agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false ORDER BY updated_at DESC NULLS LAST LIMIT 1 FOR UPDATE;
  SELECT coins INTO sender_coins FROM public.profiles WHERE id = _sender_id FOR UPDATE;

  total_available := COALESCE(sender_coins, 0)::bigint + COALESCE(helper_rec.wallet_balance, 0)::bigint + COALESCE(sender_agency_rec.diamond_balance, 0)::bigint;
  IF total_available < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'available', total_available);
  END IF;

  remaining := _amount;
  IF COALESCE(_sender_type, '') LIKE 'agency%' THEN
    IF sender_agency_rec IS NOT NULL AND COALESCE(sender_agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
      agency_balance_before := COALESCE(sender_agency_rec.diamond_balance, 0)::bigint;
      agency_deducted := LEAST(remaining, agency_balance_before);
      agency_balance_after := agency_balance_before - agency_deducted;
      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies SET diamond_balance = agency_balance_after, updated_at = now() WHERE id = sender_agency_rec.id;
      INSERT INTO public.agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id)
      VALUES (sender_agency_rec.id, 'trader_transfer_to_agency_out', 0, agency_deducted, 0, target_agency_rec.owner_id);
      remaining := remaining - agency_deducted;
    END IF;
    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
      helper_balance_before := COALESCE(helper_rec.wallet_balance, 0)::bigint;
      helper_deducted := LEAST(remaining, helper_balance_before);
      helper_balance_after := helper_balance_before - helper_deducted;
      UPDATE public.topup_helpers SET wallet_balance = helper_balance_after, updated_at = now() WHERE id = helper_rec.id;
      INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
      VALUES (helper_rec.id, 'transfer_to_agency_debit', -helper_deducted, helper_balance_before::integer, helper_balance_after::integer, _target_agency_id, 'Trader wallet transfer to agency debit', _sender_id);
      remaining := remaining - helper_deducted;
    END IF;
  ELSE
    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
      helper_balance_before := COALESCE(helper_rec.wallet_balance, 0)::bigint;
      helper_deducted := LEAST(remaining, helper_balance_before);
      helper_balance_after := helper_balance_before - helper_deducted;
      UPDATE public.topup_helpers SET wallet_balance = helper_balance_after, updated_at = now() WHERE id = helper_rec.id;
      INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
      VALUES (helper_rec.id, 'transfer_to_agency_debit', -helper_deducted, helper_balance_before::integer, helper_balance_after::integer, _target_agency_id, 'Trader wallet transfer to agency debit', _sender_id);
      remaining := remaining - helper_deducted;
    END IF;
    IF sender_agency_rec IS NOT NULL AND COALESCE(sender_agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
      agency_balance_before := COALESCE(sender_agency_rec.diamond_balance, 0)::bigint;
      agency_deducted := LEAST(remaining, agency_balance_before);
      agency_balance_after := agency_balance_before - agency_deducted;
      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies SET diamond_balance = agency_balance_after, updated_at = now() WHERE id = sender_agency_rec.id;
      INSERT INTO public.agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id)
      VALUES (sender_agency_rec.id, 'trader_transfer_to_agency_out', 0, agency_deducted, 0, target_agency_rec.owner_id);
      remaining := remaining - agency_deducted;
    END IF;
  END IF;

  IF remaining > 0 AND COALESCE(sender_coins, 0) > 0 THEN
    user_deducted := LEAST(remaining, sender_coins);
    UPDATE public.profiles SET coins = COALESCE(coins, 0) - user_deducted WHERE id = _sender_id;
  END IF;

  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
  UPDATE public.agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _amount, updated_at = now() WHERE id = _target_agency_id RETURNING diamond_balance INTO new_target_balance;
  INSERT INTO public.agency_diamond_transactions (agency_id, diamond_amount, transaction_type, user_id) VALUES (_target_agency_id, _amount, 'transfer_in', _sender_id);
  IF target_agency_rec.owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at) VALUES (target_agency_rec.owner_id, 'agency_diamond_received', 'Agency Diamonds Received', _amount::text || ' diamonds received from ' || COALESCE(v_sender_name, 'Trader'), jsonb_build_object('sender_id', _sender_id, 'target_agency_id', _target_agency_id, 'amount', _amount, 'source', _sender_type, 'action_url', '/agency-dashboard'), false, now());
  END IF;
  RETURN jsonb_build_object('success', true, 'helper_deducted', helper_deducted, 'agency_deducted', agency_deducted, 'user_deducted', user_deducted, 'new_target_balance', new_target_balance, 'target_agency_id', _target_agency_id, 'sender_agency_id', sender_agency_rec.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_payroll_to_trader(_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal RECORD;
  v_helper RECORD;
  v_amount bigint;
  v_country text;
  v_balance_before bigint;
  v_balance_after bigint;
  v_admin_id uuid;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF v_withdrawal.status <> 'pending' OR v_withdrawal.assigned_helper_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is not available for assignment');
  END IF;

  v_amount := FLOOR(COALESCE(v_withdrawal.amount, 0))::bigint;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid withdrawal amount');
  END IF;

  v_country := COALESCE(NULLIF(v_withdrawal.country_code, ''), NULLIF(v_withdrawal.payment_details->>'country_code', ''));
  IF v_country IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal country is missing');
  END IF;

  SELECT th.* INTO v_helper
  FROM public.topup_helpers th
  WHERE th.is_verified = true
    AND th.is_active = true
    AND th.payroll_enabled = true
    AND th.trader_level = 5
    AND th.country_code = v_country
    AND COALESCE(th.wallet_balance, 0) >= v_amount
  ORDER BY th.wallet_balance DESC, th.updated_at ASC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eligible Level 5 payroll helper found');
  END IF;

  v_balance_before := COALESCE(v_helper.wallet_balance, 0)::bigint;
  v_balance_after := v_balance_before - v_amount;

  UPDATE public.topup_helpers
  SET wallet_balance = v_balance_after,
      updated_at = now()
  WHERE id = v_helper.id;

  BEGIN
    v_admin_id := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_admin_id := auth.uid();
  END;

  INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
  VALUES (v_helper.id, 'agency_withdrawal_reserve', -v_amount, v_balance_before::integer, v_balance_after::integer, _withdrawal_id, 'Reserved for agency withdrawal assignment', v_admin_id);

  UPDATE public.agency_withdrawals
  SET assigned_helper_id = v_helper.id,
      status = 'processing',
      claim_locked_until = NULL,
      payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('assigned_trader', v_helper.helper_name, 'assigned_at', now(), 'assigned_by', v_admin_id),
      updated_at = now()
  WHERE id = _withdrawal_id;

  RETURN jsonb_build_object('success', true, 'helper_id', v_helper.id, 'helper_name', v_helper.helper_name, 'reserved_amount', v_amount, 'new_wallet_balance', v_balance_after);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_payroll_to_trader(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_payroll_to_trader(uuid) TO authenticated;
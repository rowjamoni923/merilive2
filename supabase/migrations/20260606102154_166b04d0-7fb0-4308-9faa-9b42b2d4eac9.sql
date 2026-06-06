-- Pkg426 Trader Wallet — hard-isolate from personal My Diamond (profiles.coins).
-- User mandate: "Trader Wallet কখনো My Diamond এর balance টাকে কখনোই যুক্ত করবে না।"
-- Bug: helper_transfer_coins_to_user + helper_transfer_diamonds_to_agency silently
-- drained sender's profiles.coins as a fallback when helper_wallet + agency.diamond_balance
-- couldn't cover the amount. Receiver side still credits profiles.coins (correct — that
-- IS the recipient's My Diamond top-up). Self-recharge RPC was already correct.

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
  total_available bigint := 0;
  new_receiver_coins bigint;
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

  -- Pkg426: Trader Wallet is helper_wallet + agency.diamond_balance ONLY. Personal coins (My Diamond) are NEVER a funding source.
  total_available := COALESCE(helper_rec.wallet_balance, 0)::bigint + COALESCE(agency_rec.diamond_balance, 0)::bigint;
  IF total_available < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient trader wallet balance', 'available', total_available);
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

  -- Pkg426: Removed fallback that drained sender's profiles.coins (My Diamond).
  -- If remaining > 0 here it means a logic error; we already guarded above.
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Trader wallet funding miscalculation (remaining=%)', remaining USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id RETURNING coins INTO new_receiver_coins;
  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes) VALUES (_sender_id, _amount, 'transfer_out', 'completed', 'Transfer to user ' || _receiver_id::text);
  INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, status, notes) VALUES (_receiver_id, _amount, 'transfer_in', 'completed', 'Transfer from ' || _sender_id::text);
  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes) VALUES (_sender_id, _receiver_id, _amount, _sender_type, 'completed', 'Trader wallet transfer to user');
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at) VALUES (_receiver_id, 'coins_received', 'Diamonds Received', _amount::text || ' diamonds received from ' || COALESCE(v_sender_name, 'Trader'), jsonb_build_object('sender_id', _sender_id, 'amount', _amount, 'source', _sender_type, 'action_url', '/recharge-history'), false, now());
  RETURN jsonb_build_object('success', true, 'helper_deducted', helper_deducted, 'agency_deducted', agency_deducted, 'user_deducted', 0, 'new_receiver_coins', new_receiver_coins);
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
  total_available bigint := 0;
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

  -- Pkg426: Trader Wallet is helper_wallet + agency.diamond_balance ONLY. Personal coins (My Diamond) are NEVER a funding source.
  total_available := COALESCE(helper_rec.wallet_balance, 0)::bigint + COALESCE(sender_agency_rec.diamond_balance, 0)::bigint;
  IF total_available < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient trader wallet balance', 'available', total_available);
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

  -- Pkg426: Removed fallback that drained sender's profiles.coins (My Diamond).
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Trader wallet funding miscalculation (remaining=%)', remaining USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
  UPDATE public.agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _amount, updated_at = now() WHERE id = _target_agency_id RETURNING diamond_balance INTO new_target_balance;
  INSERT INTO public.agency_diamond_transactions (agency_id, diamond_amount, transaction_type, user_id) VALUES (_target_agency_id, _amount, 'transfer_in', _sender_id);
  IF target_agency_rec.owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at) VALUES (target_agency_rec.owner_id, 'agency_diamond_received', 'Agency Diamonds Received', _amount::text || ' diamonds received from ' || COALESCE(v_sender_name, 'Trader'), jsonb_build_object('sender_id', _sender_id, 'target_agency_id', _target_agency_id, 'amount', _amount, 'source', _sender_type, 'action_url', '/agency-dashboard'), false, now());
  END IF;
  RETURN jsonb_build_object('success', true, 'helper_deducted', helper_deducted, 'agency_deducted', agency_deducted, 'user_deducted', 0, 'new_target_balance', new_target_balance, 'target_agency_id', _target_agency_id, 'sender_agency_id', sender_agency_rec.id);
END;
$function$;
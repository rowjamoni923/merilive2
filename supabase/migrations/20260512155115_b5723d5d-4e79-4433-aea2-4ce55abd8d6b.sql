CREATE OR REPLACE FUNCTION public.helper_transfer_coins_to_user(_sender_id uuid, _receiver_id uuid, _amount bigint, _sender_type text DEFAULT 'trader_to_user'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  helper_rec RECORD;
  agency_rec RECORD;
  profile_agency_id uuid;
  remaining bigint;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  user_deducted bigint := 0;
  new_receiver_coins bigint;
  sender_coins bigint;
BEGIN
  PERFORM set_config('app.calling_function', 'helper_transfer_coins_to_user', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  IF _sender_id = _receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _receiver_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  SELECT id, wallet_balance INTO helper_rec
  FROM topup_helpers
  WHERE user_id = _sender_id AND COALESCE(is_active, true) = true AND COALESCE(is_verified, false) = true
  ORDER BY updated_at DESC NULLS LAST LIMIT 1
  FOR UPDATE;

  SELECT p.agency_id INTO profile_agency_id FROM profiles p WHERE p.id = _sender_id;
  IF profile_agency_id IS NOT NULL THEN
    SELECT id, diamond_balance INTO agency_rec
    FROM agencies WHERE id = profile_agency_id AND COALESCE(is_active, true) = true
    FOR UPDATE;
  END IF;
  IF agency_rec IS NULL THEN
    SELECT id, diamond_balance INTO agency_rec
    FROM agencies WHERE owner_id = _sender_id AND COALESCE(is_active, true) = true
    ORDER BY updated_at DESC NULLS LAST LIMIT 1
    FOR UPDATE;
  END IF;

  SELECT coins INTO sender_coins FROM profiles WHERE id = _sender_id FOR UPDATE;

  remaining := _amount;

  IF _sender_type LIKE 'agency%' THEN
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
  ELSE
    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
      helper_deducted := LEAST(remaining, helper_rec.wallet_balance::bigint);
      UPDATE topup_helpers SET wallet_balance = wallet_balance - helper_deducted, updated_at = now() WHERE id = helper_rec.id;
      remaining := remaining - helper_deducted;
    END IF;
    IF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
      agency_deducted := LEAST(remaining, agency_rec.diamond_balance::bigint);
      UPDATE agencies SET diamond_balance = diamond_balance - agency_deducted, updated_at = now() WHERE id = agency_rec.id;
      remaining := remaining - agency_deducted;
    END IF;
  END IF;

  IF remaining > 0 AND COALESCE(sender_coins, 0) > 0 THEN
    user_deducted := LEAST(remaining, sender_coins);
    UPDATE profiles SET coins = coins - user_deducted WHERE id = _sender_id;
    remaining := remaining - user_deducted;
  END IF;

  IF remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id RETURNING coins INTO new_receiver_coins;

  INSERT INTO coin_transactions (user_id, coins_amount, transaction_type, status, notes)
  VALUES (_sender_id, _amount, 'transfer_out', 'completed', 'Transfer to user ' || _receiver_id::text);
  INSERT INTO coin_transactions (user_id, coins_amount, transaction_type, status, notes)
  VALUES (_receiver_id, _amount, 'transfer_in', 'completed', 'Transfer from ' || _sender_id::text);

  RETURN jsonb_build_object(
    'success', true,
    'helper_deducted', helper_deducted,
    'agency_deducted', agency_deducted,
    'user_deducted', user_deducted,
    'new_receiver_coins', new_receiver_coins
  );
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
  profile_agency_id uuid;
  remaining bigint;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  user_deducted bigint := 0;
  sender_coins bigint;
  new_target_balance bigint;
BEGIN
  PERFORM set_config('app.calling_function', 'helper_transfer_diamonds_to_agency', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM agencies WHERE id = _target_agency_id AND COALESCE(is_active, true) = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target agency not found');
  END IF;

  SELECT id, wallet_balance INTO helper_rec
  FROM topup_helpers
  WHERE user_id = _sender_id AND COALESCE(is_active, true) = true AND COALESCE(is_verified, false) = true
  ORDER BY updated_at DESC NULLS LAST LIMIT 1
  FOR UPDATE;

  SELECT p.agency_id INTO profile_agency_id FROM profiles p WHERE p.id = _sender_id;
  IF profile_agency_id IS NOT NULL AND profile_agency_id != _target_agency_id THEN
    SELECT id, diamond_balance INTO sender_agency_rec
    FROM agencies WHERE id = profile_agency_id AND COALESCE(is_active, true) = true
    FOR UPDATE;
  END IF;
  IF sender_agency_rec IS NULL THEN
    SELECT id, diamond_balance INTO sender_agency_rec
    FROM agencies WHERE owner_id = _sender_id AND COALESCE(is_active, true) = true AND id != _target_agency_id
    ORDER BY updated_at DESC NULLS LAST LIMIT 1
    FOR UPDATE;
  END IF;

  SELECT coins INTO sender_coins FROM profiles WHERE id = _sender_id FOR UPDATE;

  remaining := _amount;

  IF _sender_type LIKE 'agency%' THEN
    IF sender_agency_rec IS NOT NULL AND COALESCE(sender_agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
      agency_deducted := LEAST(remaining, sender_agency_rec.diamond_balance::bigint);
      UPDATE agencies SET diamond_balance = diamond_balance - agency_deducted, updated_at = now() WHERE id = sender_agency_rec.id;
      remaining := remaining - agency_deducted;
    END IF;
    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
      helper_deducted := LEAST(remaining, helper_rec.wallet_balance::bigint);
      UPDATE topup_helpers SET wallet_balance = wallet_balance - helper_deducted, updated_at = now() WHERE id = helper_rec.id;
      remaining := remaining - helper_deducted;
    END IF;
  ELSE
    IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 AND remaining > 0 THEN
      helper_deducted := LEAST(remaining, helper_rec.wallet_balance::bigint);
      UPDATE topup_helpers SET wallet_balance = wallet_balance - helper_deducted, updated_at = now() WHERE id = helper_rec.id;
      remaining := remaining - helper_deducted;
    END IF;
    IF sender_agency_rec IS NOT NULL AND COALESCE(sender_agency_rec.diamond_balance, 0) > 0 AND remaining > 0 THEN
      agency_deducted := LEAST(remaining, sender_agency_rec.diamond_balance::bigint);
      UPDATE agencies SET diamond_balance = diamond_balance - agency_deducted, updated_at = now() WHERE id = sender_agency_rec.id;
      remaining := remaining - agency_deducted;
    END IF;
  END IF;

  IF remaining > 0 AND COALESCE(sender_coins, 0) > 0 THEN
    user_deducted := LEAST(remaining, sender_coins);
    UPDATE profiles SET coins = coins - user_deducted WHERE id = _sender_id;
    remaining := remaining - user_deducted;
  END IF;

  IF remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _amount, updated_at = now()
  WHERE id = _target_agency_id
  RETURNING diamond_balance INTO new_target_balance;

  INSERT INTO agency_diamond_transactions (agency_id, diamond_amount, transaction_type, user_id)
  VALUES (_target_agency_id, _amount, 'transfer_in', _sender_id);

  RETURN jsonb_build_object(
    'success', true,
    'helper_deducted', helper_deducted,
    'agency_deducted', agency_deducted,
    'user_deducted', user_deducted,
    'new_target_balance', new_target_balance
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) TO authenticated;
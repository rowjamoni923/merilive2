-- Fix #1: helper_transfer_diamonds_to_self — move bypass to top so agencies UPDATE is allowed
CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(_user_id uuid, _amount bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  helper_rec RECORD; agency_rec RECORD; profile_agency_id uuid;
  remaining bigint; helper_deducted bigint := 0; agency_deducted bigint := 0;
  new_wallet bigint; new_coins bigint;
BEGIN
  -- CRITICAL: bypass financial protection trigger for agencies / topup_helpers / profiles updates
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.calling_function', 'helper_transfer_diamonds_to_self', true);

  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized sender');
  END IF;

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

  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id RETURNING coins INTO new_coins;
  IF helper_rec IS NOT NULL THEN
    SELECT wallet_balance INTO new_wallet FROM topup_helpers WHERE id = helper_rec.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'helper_deducted', helper_deducted,
    'agency_deducted', agency_deducted,
    'new_coins', new_coins,
    'new_wallet_balance', new_wallet,
    'new_agency_balance', CASE WHEN agency_rec IS NOT NULL THEN (SELECT diamond_balance FROM agencies WHERE id = agency_rec.id) ELSE NULL END
  );
END;
$function$;

-- Fix #2: Allow helpers to toggle their own listing visibility via secure RPC
CREATE OR REPLACE FUNCTION public.set_topup_helper_listing(_is_listed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_rows int;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  UPDATE public.topup_helpers
     SET is_listed = _is_listed,
         updated_at = now()
   WHERE user_id = v_user;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No helper account found');
  END IF;

  RETURN jsonb_build_object('success', true, 'is_listed', _is_listed);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_topup_helper_listing(boolean) TO authenticated;
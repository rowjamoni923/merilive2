DROP FUNCTION IF EXISTS public.get_transfer_wallet_sources(uuid);

CREATE FUNCTION public.get_transfer_wallet_sources(_user_id uuid)
RETURNS TABLE (
  helper_id uuid,
  helper_wallet_balance bigint,
  agency_id uuid,
  agency_diamond_balance bigint,
  personal_coins bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_agency_id uuid;
BEGIN
  SELECT p.agency_id
  INTO profile_agency_id
  FROM public.profiles p
  WHERE p.id = _user_id;

  RETURN QUERY
  WITH latest_helper AS (
    SELECT h.id,
           COALESCE(h.wallet_balance, 0)::bigint AS wallet_balance
    FROM public.topup_helpers h
    WHERE h.user_id = _user_id
      AND COALESCE(h.is_verified, false) = true
      AND COALESCE(h.is_active, true) = true
    ORDER BY h.updated_at DESC NULLS LAST, h.created_at DESC NULLS LAST, h.id DESC
    LIMIT 1
  ),
  latest_owned_agency AS (
    SELECT a.id,
           COALESCE(a.diamond_balance, 0)::bigint AS diamond_balance
    FROM public.agencies a
    WHERE a.owner_id = _user_id
      AND COALESCE(a.is_active, true) = true
      AND COALESCE(a.is_verified, true) = true
    ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC NULLS LAST, a.id DESC
    LIMIT 1
  ),
  latest_profile_agency AS (
    SELECT a.id,
           COALESCE(a.diamond_balance, 0)::bigint AS diamond_balance
    FROM public.agencies a
    WHERE a.id = profile_agency_id
      AND COALESCE(a.is_active, true) = true
      AND COALESCE(a.is_verified, true) = true
    ORDER BY a.updated_at DESC NULLS LAST, a.created_at DESC NULLS LAST, a.id DESC
    LIMIT 1
  ),
  resolved_agency AS (
    SELECT * FROM latest_owned_agency
    UNION ALL
    SELECT * FROM latest_profile_agency
    WHERE NOT EXISTS (SELECT 1 FROM latest_owned_agency)
  )
  SELECT
    lh.id,
    COALESCE(lh.wallet_balance, 0),
    ra.id,
    COALESCE(ra.diamond_balance, 0),
    COALESCE((SELECT p.coins FROM public.profiles p WHERE p.id = _user_id), 0)::bigint
  FROM (SELECT 1) base
  LEFT JOIN latest_helper lh ON true
  LEFT JOIN resolved_agency ra ON true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_transfer_wallet_sources(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_transfer_wallet_sources(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transfer_wallet_sources(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.helper_transfer_diamonds_to_self(uuid, bigint);

CREATE FUNCTION public.helper_transfer_diamonds_to_self(
  _user_id uuid,
  _amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  helper_rec record;
  agency_rec record;
  source_rec record;
  remaining bigint := _amount;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  current_coins bigint := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF auth.uid() <> _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You can only recharge your own balance');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT *
  INTO source_rec
  FROM public.get_transfer_wallet_sources(_user_id)
  LIMIT 1;

  IF source_rec.helper_id IS NOT NULL THEN
    SELECT *
    INTO helper_rec
    FROM public.topup_helpers
    WHERE id = source_rec.helper_id
    FOR UPDATE;
  END IF;

  IF source_rec.agency_id IS NOT NULL THEN
    SELECT *
    INTO agency_rec
    FROM public.agencies
    WHERE id = source_rec.agency_id
    FOR UPDATE;
  END IF;

  IF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) >= remaining THEN
    UPDATE public.topup_helpers
    SET wallet_balance = COALESCE(wallet_balance, 0) - remaining,
        updated_at = now()
    WHERE id = helper_rec.id;

    helper_deducted := remaining;
    remaining := 0;
  ELSIF helper_rec IS NOT NULL AND COALESCE(helper_rec.wallet_balance, 0) > 0 THEN
    helper_deducted := COALESCE(helper_rec.wallet_balance, 0)::bigint;
    remaining := remaining - helper_deducted;

    UPDATE public.topup_helpers
    SET wallet_balance = 0,
        updated_at = now()
    WHERE id = helper_rec.id;
  END IF;

  IF remaining > 0 AND agency_rec IS NOT NULL THEN
    IF COALESCE(agency_rec.diamond_balance, 0) >= remaining THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) - remaining,
          updated_at = now()
      WHERE id = agency_rec.id;

      agency_deducted := remaining;
      remaining := 0;
    ELSIF COALESCE(agency_rec.diamond_balance, 0) > 0 THEN
      agency_deducted := COALESCE(agency_rec.diamond_balance, 0)::bigint;
      remaining := remaining - agency_deducted;

      UPDATE public.agencies
      SET diamond_balance = 0,
          updated_at = now()
      WHERE id = agency_rec.id;
    END IF;
  END IF;

  IF remaining > 0 THEN
    IF helper_deducted > 0 AND helper_rec IS NOT NULL THEN
      UPDATE public.topup_helpers
      SET wallet_balance = COALESCE(wallet_balance, 0) + helper_deducted,
          updated_at = now()
      WHERE id = helper_rec.id;
    END IF;

    IF agency_deducted > 0 AND agency_rec IS NOT NULL THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) + agency_deducted,
          updated_at = now()
      WHERE id = agency_rec.id;
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient wallet balance',
      'helper_balance', COALESCE((SELECT wallet_balance FROM public.topup_helpers WHERE id = source_rec.helper_id), 0),
      'agency_balance', COALESCE((SELECT diamond_balance FROM public.agencies WHERE id = source_rec.agency_id), 0)
    );
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _user_id;

  SELECT COALESCE(coins, 0)
  INTO current_coins
  FROM public.profiles
  WHERE id = _user_id;

  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status)
  VALUES (_user_id, _user_id, _amount, 'self_recharge', 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'amount', _amount,
    'helper_deducted', helper_deducted,
    'agency_deducted', agency_deducted,
    'new_coins', current_coins,
    'new_wallet_balance', COALESCE((SELECT wallet_balance FROM public.topup_helpers WHERE id = source_rec.helper_id), 0),
    'new_agency_balance', COALESCE((SELECT diamond_balance FROM public.agencies WHERE id = source_rec.agency_id), 0),
    'resolved_helper_id', source_rec.helper_id,
    'resolved_agency_id', source_rec.agency_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) TO service_role;

DROP FUNCTION IF EXISTS public.helper_transfer_coins_to_user(uuid, uuid, bigint, text);

CREATE FUNCTION public.helper_transfer_coins_to_user(
  _sender_id uuid,
  _receiver_id uuid,
  _amount bigint,
  _sender_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  helper_rec record;
  agency_rec record;
  source_rec record;
  sender_coins bigint := 0;
  agency_deducted bigint := 0;
  helper_deducted bigint := 0;
  user_deducted bigint := 0;
  remaining bigint := _amount;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF _sender_id IS NULL OR _receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender and receiver are required');
  END IF;

  IF _sender_id = _receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender and receiver must be different');
  END IF;

  SELECT *
  INTO source_rec
  FROM public.get_transfer_wallet_sources(_sender_id)
  LIMIT 1;

  IF source_rec.helper_id IS NOT NULL THEN
    SELECT *
    INTO helper_rec
    FROM public.topup_helpers
    WHERE id = source_rec.helper_id
    FOR UPDATE;
  END IF;

  IF source_rec.agency_id IS NOT NULL THEN
    SELECT *
    INTO agency_rec
    FROM public.agencies
    WHERE id = source_rec.agency_id
    FOR UPDATE;
  END IF;

  IF _sender_type = 'agency_to_user' AND agency_rec IS NOT NULL THEN
    IF COALESCE(agency_rec.diamond_balance, 0) >= remaining THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) - remaining,
          updated_at = now()
      WHERE id = agency_rec.id;

      agency_deducted := remaining;
      remaining := 0;
    ELSIF COALESCE(agency_rec.diamond_balance, 0) > 0 THEN
      agency_deducted := COALESCE(agency_rec.diamond_balance, 0)::bigint;
      remaining := remaining - agency_deducted;

      UPDATE public.agencies
      SET diamond_balance = 0,
          updated_at = now()
      WHERE id = agency_rec.id;
    END IF;
  END IF;

  IF remaining > 0 AND helper_rec IS NOT NULL THEN
    IF COALESCE(helper_rec.wallet_balance, 0) >= remaining THEN
      UPDATE public.topup_helpers
      SET wallet_balance = COALESCE(wallet_balance, 0) - remaining,
          updated_at = now()
      WHERE id = helper_rec.id;

      helper_deducted := remaining;
      remaining := 0;
    ELSIF COALESCE(helper_rec.wallet_balance, 0) > 0 THEN
      helper_deducted := COALESCE(helper_rec.wallet_balance, 0)::bigint;
      remaining := remaining - helper_deducted;

      UPDATE public.topup_helpers
      SET wallet_balance = 0,
          updated_at = now()
      WHERE id = helper_rec.id;
    END IF;
  END IF;

  IF remaining > 0 THEN
    SELECT COALESCE(coins, 0)
    INTO sender_coins
    FROM public.profiles
    WHERE id = _sender_id
    FOR UPDATE;

    IF sender_coins >= remaining THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles
      SET coins = COALESCE(coins, 0) - remaining
      WHERE id = _sender_id;

      user_deducted := remaining;
      remaining := 0;
    END IF;
  END IF;

  IF remaining > 0 THEN
    IF agency_deducted > 0 AND agency_rec IS NOT NULL THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) + agency_deducted,
          updated_at = now()
      WHERE id = agency_rec.id;
    END IF;

    IF helper_deducted > 0 AND helper_rec IS NOT NULL THEN
      UPDATE public.topup_helpers
      SET wallet_balance = COALESCE(wallet_balance, 0) + helper_deducted,
          updated_at = now()
      WHERE id = helper_rec.id;
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _receiver_id;

  IF NOT FOUND THEN
    IF agency_deducted > 0 AND agency_rec IS NOT NULL THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) + agency_deducted,
          updated_at = now()
      WHERE id = agency_rec.id;
    END IF;

    IF helper_deducted > 0 AND helper_rec IS NOT NULL THEN
      UPDATE public.topup_helpers
      SET wallet_balance = COALESCE(wallet_balance, 0) + helper_deducted,
          updated_at = now()
      WHERE id = helper_rec.id;
    END IF;

    IF user_deducted > 0 THEN
      UPDATE public.profiles
      SET coins = COALESCE(coins, 0) + user_deducted
      WHERE id = _sender_id;
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status)
  VALUES (_sender_id, _receiver_id, _amount, _sender_type, 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'amount', _amount,
    'agency_deducted', agency_deducted,
    'helper_deducted', helper_deducted,
    'user_deducted', user_deducted,
    'resolved_helper_id', source_rec.helper_id,
    'resolved_agency_id', source_rec.agency_id,
    'new_wallet_balance', COALESCE((SELECT wallet_balance FROM public.topup_helpers WHERE id = source_rec.helper_id), 0),
    'new_agency_balance', COALESCE((SELECT diamond_balance FROM public.agencies WHERE id = source_rec.agency_id), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) TO service_role;

DROP FUNCTION IF EXISTS public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text);

CREATE FUNCTION public.helper_transfer_diamonds_to_agency(
  _sender_id uuid,
  _target_agency_id uuid,
  _amount bigint,
  _sender_type text DEFAULT 'trader_to_agency'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  helper_rec record;
  sender_agency_rec record;
  target_agency_rec record;
  source_rec record;
  sender_coins bigint := 0;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  user_deducted bigint := 0;
  remaining bigint := _amount;
  new_agency_balance bigint := 0;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT *
  INTO target_agency_rec
  FROM public.agencies
  WHERE id = _target_agency_id
  FOR UPDATE;

  IF target_agency_rec IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target agency not found');
  END IF;

  SELECT *
  INTO source_rec
  FROM public.get_transfer_wallet_sources(_sender_id)
  LIMIT 1;

  IF source_rec.helper_id IS NOT NULL THEN
    SELECT *
    INTO helper_rec
    FROM public.topup_helpers
    WHERE id = source_rec.helper_id
    FOR UPDATE;
  END IF;

  IF source_rec.agency_id IS NOT NULL THEN
    SELECT *
    INTO sender_agency_rec
    FROM public.agencies
    WHERE id = source_rec.agency_id
    FOR UPDATE;
  END IF;

  IF _sender_type = 'agency_to_agency' AND sender_agency_rec IS NOT NULL THEN
    IF COALESCE(sender_agency_rec.diamond_balance, 0) >= remaining THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) - remaining,
          updated_at = now()
      WHERE id = sender_agency_rec.id;

      agency_deducted := remaining;
      remaining := 0;
    ELSIF COALESCE(sender_agency_rec.diamond_balance, 0) > 0 THEN
      agency_deducted := COALESCE(sender_agency_rec.diamond_balance, 0)::bigint;
      remaining := remaining - agency_deducted;

      UPDATE public.agencies
      SET diamond_balance = 0,
          updated_at = now()
      WHERE id = sender_agency_rec.id;
    END IF;
  END IF;

  IF remaining > 0 AND helper_rec IS NOT NULL THEN
    IF COALESCE(helper_rec.wallet_balance, 0) >= remaining THEN
      UPDATE public.topup_helpers
      SET wallet_balance = COALESCE(wallet_balance, 0) - remaining,
          updated_at = now()
      WHERE id = helper_rec.id;

      helper_deducted := remaining;
      remaining := 0;
    ELSIF COALESCE(helper_rec.wallet_balance, 0) > 0 THEN
      helper_deducted := COALESCE(helper_rec.wallet_balance, 0)::bigint;
      remaining := remaining - helper_deducted;

      UPDATE public.topup_helpers
      SET wallet_balance = 0,
          updated_at = now()
      WHERE id = helper_rec.id;
    END IF;
  END IF;

  IF remaining > 0 THEN
    SELECT COALESCE(coins, 0)
    INTO sender_coins
    FROM public.profiles
    WHERE id = _sender_id
    FOR UPDATE;

    IF sender_coins >= remaining THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles
      SET coins = COALESCE(coins, 0) - remaining
      WHERE id = _sender_id;

      user_deducted := remaining;
      remaining := 0;
    END IF;
  END IF;

  IF remaining > 0 THEN
    IF agency_deducted > 0 AND sender_agency_rec IS NOT NULL THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) + agency_deducted,
          updated_at = now()
      WHERE id = sender_agency_rec.id;
    END IF;

    IF helper_deducted > 0 AND helper_rec IS NOT NULL THEN
      UPDATE public.topup_helpers
      SET wallet_balance = COALESCE(wallet_balance, 0) + helper_deducted,
          updated_at = now()
      WHERE id = helper_rec.id;
    END IF;

    IF user_deducted > 0 THEN
      UPDATE public.profiles
      SET coins = COALESCE(coins, 0) + user_deducted
      WHERE id = _sender_id;
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE public.agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount,
      updated_at = now()
  WHERE id = _target_agency_id
  RETURNING diamond_balance INTO new_agency_balance;

  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status)
  VALUES (_sender_id, COALESCE(target_agency_rec.owner_id, _sender_id), _amount, _sender_type, 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'amount', _amount,
    'agency_deducted', agency_deducted,
    'helper_deducted', helper_deducted,
    'user_deducted', user_deducted,
    'new_agency_balance', new_agency_balance,
    'resolved_helper_id', source_rec.helper_id,
    'resolved_sender_agency_id', source_rec.agency_id,
    'new_wallet_balance', COALESCE((SELECT wallet_balance FROM public.topup_helpers WHERE id = source_rec.helper_id), 0),
    'new_sender_agency_balance', COALESCE((SELECT diamond_balance FROM public.agencies WHERE id = source_rec.agency_id), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) TO service_role;
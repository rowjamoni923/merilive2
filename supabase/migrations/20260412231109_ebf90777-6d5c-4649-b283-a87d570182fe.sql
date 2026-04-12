DROP FUNCTION IF EXISTS public.helper_transfer_diamonds_to_self(uuid, integer);
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
  INTO helper_rec
  FROM public.topup_helpers
  WHERE user_id = _user_id
    AND COALESCE(is_verified, false) = true
    AND COALESCE(is_active, true) = true
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
  LIMIT 1
  FOR UPDATE;

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

  IF remaining > 0 THEN
    SELECT *
    INTO agency_rec
    FROM public.agencies
    WHERE owner_id = _user_id
      AND COALESCE(is_active, true) = true
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    LIMIT 1
    FOR UPDATE;

    IF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) >= remaining THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) - remaining,
          updated_at = now()
      WHERE id = agency_rec.id;

      agency_deducted := remaining;
      remaining := 0;
    ELSIF agency_rec IS NOT NULL AND COALESCE(agency_rec.diamond_balance, 0) > 0 THEN
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
      'helper_balance', COALESCE((SELECT wallet_balance FROM public.topup_helpers WHERE id = helper_rec.id), 0),
      'agency_balance', COALESCE((SELECT diamond_balance FROM public.agencies WHERE id = agency_rec.id), 0)
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
    'new_wallet_balance', COALESCE((SELECT wallet_balance FROM public.topup_helpers WHERE id = helper_rec.id), 0),
    'new_agency_balance', COALESCE((SELECT diamond_balance FROM public.agencies WHERE id = agency_rec.id), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) TO service_role;
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
  sender_coins bigint := 0;
  agency_deducted bigint := 0;
  helper_deducted bigint := 0;
  user_deducted bigint := 0;
  remaining bigint := _amount;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF _sender_id IS NULL OR _receiver_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender and receiver are required');
  END IF;

  IF _sender_id = _receiver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender and receiver must be different');
  END IF;

  IF _sender_type = 'agency_to_user' THEN
    SELECT *
    INTO agency_rec
    FROM public.agencies
    WHERE owner_id = _sender_id
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
    SELECT *
    INTO helper_rec
    FROM public.topup_helpers
    WHERE user_id = _sender_id
      AND COALESCE(is_verified, false) = true
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
    ELSE
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
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _receiver_id;

  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status)
  VALUES (_sender_id, _receiver_id, _amount, _sender_type, 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'amount', _amount,
    'agency_deducted', agency_deducted,
    'helper_deducted', helper_deducted,
    'user_deducted', user_deducted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) TO service_role;
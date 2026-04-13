
-- Fix helper_transfer_diamonds_to_agency: add proper filters and ordering
-- to match helper_transfer_coins_to_user and helper_transfer_diamonds_to_self

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
  sender_coins bigint := 0;
  helper_deducted bigint := 0;
  agency_deducted bigint := 0;
  user_deducted bigint := 0;
  remaining bigint := _amount;
  new_agency_balance bigint := 0;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  IF _sender_id IS NULL OR _target_agency_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender and target agency are required');
  END IF;

  -- Lock target agency
  SELECT *
  INTO target_agency_rec
  FROM public.agencies
  WHERE id = _target_agency_id
  FOR UPDATE;

  IF target_agency_rec IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target agency not found');
  END IF;

  -- TIER 1: Deduct from sender's agency (if agency_to_agency)
  IF _sender_type = 'agency_to_agency' THEN
    SELECT *
    INTO sender_agency_rec
    FROM public.agencies
    WHERE owner_id = _sender_id
      AND COALESCE(is_active, true) = true
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    LIMIT 1
    FOR UPDATE;

    IF sender_agency_rec IS NOT NULL AND COALESCE(sender_agency_rec.diamond_balance, 0) >= remaining THEN
      UPDATE public.agencies
      SET diamond_balance = COALESCE(diamond_balance, 0) - remaining,
          updated_at = now()
      WHERE id = sender_agency_rec.id;

      agency_deducted := remaining;
      remaining := 0;
    ELSIF sender_agency_rec IS NOT NULL AND COALESCE(sender_agency_rec.diamond_balance, 0) > 0 THEN
      agency_deducted := COALESCE(sender_agency_rec.diamond_balance, 0)::bigint;
      remaining := remaining - agency_deducted;

      UPDATE public.agencies
      SET diamond_balance = 0,
          updated_at = now()
      WHERE id = sender_agency_rec.id;
    END IF;
  END IF;

  -- TIER 2: Deduct from helper wallet
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

  -- TIER 3: Deduct from personal coins
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

  -- ROLLBACK if still remaining
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

    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Credit target agency
  UPDATE public.agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount,
      updated_at = now()
  WHERE id = _target_agency_id
  RETURNING diamond_balance INTO new_agency_balance;

  -- Log transfer
  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status)
  VALUES (_sender_id, COALESCE(target_agency_rec.owner_id, _sender_id), _amount, _sender_type, 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'amount', _amount,
    'agency_deducted', agency_deducted,
    'helper_deducted', helper_deducted,
    'user_deducted', user_deducted,
    'new_agency_balance', new_agency_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_agency(uuid, uuid, bigint, text) TO service_role;

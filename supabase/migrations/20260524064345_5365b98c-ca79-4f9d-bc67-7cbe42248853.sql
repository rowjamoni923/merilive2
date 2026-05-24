CREATE OR REPLACE FUNCTION public.claim_first_recharge_bonus_and_credit(
  _user_id uuid,
  _bonus_id uuid,
  _original_amount integer,
  _bonus_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance integer;
BEGIN
  IF _user_id IS NULL OR _bonus_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_required_fields');
  END IF;

  IF COALESCE(_original_amount, 0) <= 0 OR COALESCE(_bonus_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  INSERT INTO public.first_recharge_claims (user_id, bonus_id, original_amount, bonus_amount)
  VALUES (_user_id, _bonus_id, _original_amount, _bonus_amount);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _bonus_amount,
      updated_at = now()
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;

  IF NOT FOUND THEN
    DELETE FROM public.first_recharge_claims WHERE user_id = _user_id AND bonus_id = _bonus_id;
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('success', true, 'bonus_amount', _bonus_amount, 'new_balance', _new_balance);
EXCEPTION WHEN unique_violation THEN
  SELECT COALESCE(coins, 0) INTO _new_balance FROM public.profiles WHERE id = _user_id;
  RETURN jsonb_build_object('success', true, 'already_claimed', true, 'bonus_amount', 0, 'new_balance', COALESCE(_new_balance, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_first_recharge_bonus_and_credit(uuid, uuid, integer, integer) TO authenticated;
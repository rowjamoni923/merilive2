CREATE OR REPLACE FUNCTION public.helper_add_coins_to_user(_user_id uuid, _amount integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _new_balance INTEGER;
BEGIN
  -- Pkg338 final lockdown: this legacy direct-credit function is a mint path.
  -- Helpers/traders must use helper_transfer_coins_to_user(), which deducts from
  -- an approved wallet/agency/user balance before crediting the receiver.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: admin only');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _amount,
      updated_at = now()
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    COALESCE(auth.uid()::text, 'service_role'),
    'admin_add_coins_legacy_helper_path',
    _user_id::text,
    'user',
    jsonb_build_object('amount', _amount, 'type', 'admin_direct_credit')
  );

  RETURN json_build_object('success', true, 'new_balance', _new_balance);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.helper_add_coins_to_user(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helper_add_coins_to_user(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.helper_add_coins_to_user(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_add_coins_to_user(uuid, integer) TO service_role;
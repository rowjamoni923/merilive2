CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id uuid, _amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_pending uuid;
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR COALESCE(auth.role(), '') = 'service_role';
  v_admin_id uuid := public.current_admin_id_from_header();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF _amount > 10000000 THEN
    RAISE EXCEPTION 'Amount too large';
  END IF;

  IF NOT v_is_service
     AND v_admin_id IS NULL
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT v_is_service THEN
    v_role := COALESCE(public.current_effective_admin_role(), public._current_admin_role());
    IF v_role = 'sub_admin' THEN
      v_pending := public._enqueue_admin_pending_action(
        'add_diamonds', _user_id, NULL,
        jsonb_build_object('user_id', _user_id, 'amount', _amount), NULL
      );
      RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET diamonds = COALESCE(diamonds, 0) + _amount,
         updated_at = now()
   WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_beans_to_user(_user_id uuid, _amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_pending uuid;
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR COALESCE(auth.role(), '') = 'service_role';
  v_admin_id uuid := public.current_admin_id_from_header();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF _amount > 10000000 THEN
    RAISE EXCEPTION 'Amount too large';
  END IF;

  IF NOT v_is_service
     AND v_admin_id IS NULL
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add beans';
  END IF;

  IF NOT v_is_service THEN
    v_role := COALESCE(public.current_effective_admin_role(), public._current_admin_role());
    IF v_role = 'sub_admin' THEN
      v_pending := public._enqueue_admin_pending_action(
        'add_beans', _user_id, NULL,
        jsonb_build_object('user_id', _user_id, 'amount', _amount), NULL
      );
      RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET beans = COALESCE(beans, 0) + _amount,
         updated_at = now()
   WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_coins_to_user(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_service boolean := COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR COALESCE(auth.role(), '') = 'service_role';
  v_admin_id uuid := public.current_admin_id_from_header();
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF _amount > 10000000 THEN
    RAISE EXCEPTION 'Amount too large';
  END IF;

  IF NOT v_is_service
     AND v_admin_id IS NULL
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add coins';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + _amount,
         updated_at = now()
   WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_id, target_type, details)
    VALUES (
      v_admin_id,
      'add_coins',
      _user_id,
      'user',
      jsonb_build_object('amount', _amount, 'action', 'admin_coin_add')
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_diamonds_to_user(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_beans_to_user(uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_coins_to_user(uuid, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.add_diamonds_to_user(uuid, integer) IS
'Pkg373: admin-token aware reward helper; credits the real profiles.diamonds column and relies on admin profile-update triggers for instant notifications.';
COMMENT ON FUNCTION public.add_beans_to_user(uuid, integer) IS
'Pkg373: admin-token aware reward helper; credits profiles.beans and relies on admin profile-update triggers for instant notifications.';
COMMENT ON FUNCTION public.add_coins_to_user(uuid, integer) IS
'Pkg373: admin-token aware legacy reward helper; accepts x-admin-token/admin/service callers and preserves the existing void return type.';
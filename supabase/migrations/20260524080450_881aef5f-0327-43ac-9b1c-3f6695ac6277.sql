-- Pkg275 Section #9 deep audit follow-up: critical mint bugs

-- 1) Lock all _internal_add_* helpers to service_role only.
--    These were SECURITY DEFINER with no auth check AND PUBLIC EXECUTE,
--    so any anon caller could mint unlimited beans/coins/diamonds on any profile.
REVOKE EXECUTE ON FUNCTION public._internal_add_beans(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._internal_add_coins(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._internal_add_diamonds(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._internal_add_diamonds(uuid, bigint)  FROM PUBLIC, anon, authenticated;

-- Belt-and-suspenders: add internal caller assertion so even if grants
-- regress in the future, the body refuses non-service callers.
CREATE OR REPLACE FUNCTION public._internal_add_beans(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: _internal_add_beans is internal only';
  END IF;
  IF _amount = 0 THEN RETURN; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET beans = COALESCE(beans, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._internal_add_coins(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: _internal_add_coins is internal only';
  END IF;
  IF _amount <= 0 THEN RETURN; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._internal_add_diamonds(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: _internal_add_diamonds is internal only';
  END IF;
  IF _amount = 0 THEN RETURN; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._internal_add_diamonds(_user_id uuid, _amount bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: _internal_add_diamonds is internal only';
  END IF;
  IF _amount = 0 THEN RETURN; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _amount WHERE id = _user_id;
END;
$$;

-- 2) add_beans_to_user: anon callers had auth.uid() = NULL which made
--    v_is_service true and bypassed the admin check.  Restrict the
--    "service" fallback to a real service_role JWT only.
CREATE OR REPLACE FUNCTION public.add_beans_to_user(_user_id uuid, _amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_role text; v_pending uuid; v_is_service boolean;
BEGIN
  v_is_service := COALESCE(auth.role(), '') = 'service_role';

  IF NOT v_is_service
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add beans';
  END IF;

  IF NOT v_is_service THEN
    v_role := public._current_admin_role();
    IF v_role = 'sub_admin' THEN
      v_pending := public._enqueue_admin_pending_action('add_beans', _user_id, NULL,
        jsonb_build_object('user_id', _user_id, 'amount', _amount), NULL);
      RETURN jsonb_build_object('pending', true, 'request_id', v_pending);
    END IF;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET beans = COALESCE(beans, 0) + _amount WHERE id = _user_id;
  RETURN jsonb_build_object('success', true);
END $$;

-- 3) auto_verify_gift_transactions is unattached but its body would
--    double-credit beans if ever re-attached to gift_transactions.
--    Drop it outright -- process_gift_transaction is the only authority.
DROP FUNCTION IF EXISTS public.auto_verify_gift_transactions() CASCADE;
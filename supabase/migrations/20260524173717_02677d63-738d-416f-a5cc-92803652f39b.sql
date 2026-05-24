-- Pkg311 pass-2: lock down exposed level recalculation RPCs

CREATE OR REPLACE FUNCTION public._pkg311_can_recalculate_level(_target_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR public.is_active_admin_session()
    OR (_target_user_id IS NOT NULL AND auth.uid() = _target_user_id)
$$;

DO $$
BEGIN
  IF to_regprocedure('public._pkg311_recalculate_all_user_levels_impl()') IS NULL
     AND to_regprocedure('public.recalculate_all_user_levels()') IS NOT NULL THEN
    ALTER FUNCTION public.recalculate_all_user_levels() RENAME TO _pkg311_recalculate_all_user_levels_impl;
  END IF;

  IF to_regprocedure('public._pkg311_recalculate_single_user_level_impl(uuid)') IS NULL
     AND to_regprocedure('public.recalculate_single_user_level(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.recalculate_single_user_level(uuid) RENAME TO _pkg311_recalculate_single_user_level_impl;
  END IF;

  IF to_regprocedure('public._pkg311_recalculate_user_level_impl(uuid)') IS NULL
     AND to_regprocedure('public.recalculate_user_level(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.recalculate_user_level(uuid) RENAME TO _pkg311_recalculate_user_level_impl;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_all_user_levels()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._pkg311_can_recalculate_level(NULL) THEN
    RAISE EXCEPTION 'recalculate_all_user_levels: forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM public._pkg311_recalculate_all_user_levels_impl();
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_single_user_level(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._pkg311_can_recalculate_level(_user_id) THEN
    RAISE EXCEPTION 'recalculate_single_user_level: forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM public._pkg311_recalculate_single_user_level_impl(_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_user_level(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._pkg311_can_recalculate_level(_user_id) THEN
    RAISE EXCEPTION 'recalculate_user_level: forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM public._pkg311_recalculate_user_level_impl(_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._pkg311_can_recalculate_level(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pkg311_recalculate_all_user_levels_impl() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pkg311_recalculate_single_user_level_impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pkg311_recalculate_user_level_impl(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.recalculate_all_user_levels() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_single_user_level(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalculate_user_level(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.recalculate_all_user_levels() TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_single_user_level(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_user_level(uuid) TO authenticated, service_role;
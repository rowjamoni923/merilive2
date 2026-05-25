-- Pkg341 final pass: hardened agency-management RPCs replacing direct UI table mutations

CREATE OR REPLACE FUNCTION public._p341_assert_admin_can_target_agency(
  _agency_id uuid,
  _sections text[],
  _require_edit boolean DEFAULT true,
  _protect_owner boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session required');
  END IF;

  IF NOT public.admin_has_any_section_permission(_sections, _require_edit) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient section permission');
  END IF;

  SELECT owner_id INTO v_owner
  FROM public.agencies
  WHERE id = _agency_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  IF _protect_owner AND public._is_target_user_owner(v_owner) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot target an owner-owned agency');
  END IF;

  RETURN jsonb_build_object('success', true, 'owner_id', v_owner);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_agency_active_status(
  _agency_id uuid,
  _active boolean,
  _reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_guard jsonb;
BEGIN
  v_guard := public._p341_assert_admin_can_target_agency(
    _agency_id,
    ARRAY['agency-management'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  UPDATE public.agencies
     SET is_active = _active,
         is_blocked = NOT _active,
         blocked_reason = CASE WHEN NOT _active THEN COALESCE(NULLIF(trim(_reason), ''), 'Cancelled by admin') ELSE NULL END,
         blocked_at = CASE WHEN NOT _active THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = _agency_id;

  PERFORM public.log_admin_action(
    'set_agency_active_status', 'agency', _agency_id::text,
    jsonb_build_object('active', _active, 'reason', _reason, 'admin_id', public.current_admin_id_from_header())
  );

  RETURN jsonb_build_object('success', true, 'active', _active, 'owner_id', v_guard->>'owner_id');
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_agency_level(_agency_id uuid, _level text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_guard jsonb;
  v_level text;
BEGIN
  v_guard := public._p341_assert_admin_can_target_agency(
    _agency_id,
    ARRAY['agency-management'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  v_level := upper(trim(coalesce(_level, '')));
  IF v_level = '' OR length(v_level) > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid agency level');
  END IF;

  UPDATE public.agencies
     SET level = v_level,
         updated_at = now()
   WHERE id = _agency_id;

  PERFORM public.log_admin_action(
    'update_agency_level', 'agency', _agency_id::text,
    jsonb_build_object('new_level', v_level, 'admin_id', public.current_admin_id_from_header())
  );

  RETURN jsonb_build_object('success', true, 'level', v_level);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_promote_agency_owner_to_payroll_helper(_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_guard jsonb;
  v_owner uuid;
  v_country text;
  v_name text;
  v_helper_id uuid;
BEGIN
  v_guard := public._p341_assert_admin_can_target_agency(
    _agency_id,
    ARRAY['agency-management'],
    true,
    true
  );
  IF NOT COALESCE((v_guard->>'success')::boolean, false) THEN
    RETURN v_guard;
  END IF;

  v_owner := (v_guard->>'owner_id')::uuid;

  SELECT country_code, display_name INTO v_country, v_name
  FROM public.profiles
  WHERE id = v_owner;

  INSERT INTO public.topup_helpers (
    user_id,
    trader_level,
    payroll_enabled,
    payroll_status,
    payroll_approved_at,
    is_active,
    is_verified,
    country_code,
    wallet_balance
  ) VALUES (
    v_owner,
    5,
    true,
    'approved',
    now(),
    true,
    true,
    v_country,
    0
  )
  ON CONFLICT (user_id) DO UPDATE
    SET trader_level = 5,
        payroll_enabled = true,
        payroll_status = 'approved',
        payroll_approved_at = now(),
        is_active = true,
        is_verified = true,
        country_code = COALESCE(EXCLUDED.country_code, public.topup_helpers.country_code),
        updated_at = now()
  RETURNING id INTO v_helper_id;

  PERFORM set_config('app.bypass_profile_protection','true',true);
  UPDATE public.profiles
     SET is_verified = true,
         updated_at = now()
   WHERE id = v_owner;
  PERFORM set_config('app.bypass_profile_protection','false',true);

  PERFORM public.log_admin_action(
    'promote_agency_owner_to_payroll_helper', 'agency', _agency_id::text,
    jsonb_build_object('owner_id', v_owner, 'helper_id', v_helper_id, 'admin_id', public.current_admin_id_from_header())
  );

  RETURN jsonb_build_object('success', true, 'owner_id', v_owner, 'helper_id', v_helper_id, 'display_name', v_name);
END;
$function$;

REVOKE ALL ON FUNCTION public._p341_assert_admin_can_target_agency(uuid, text[], boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_agency_active_status(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_agency_level(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_promote_agency_owner_to_payroll_helper(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._p341_assert_admin_can_target_agency(uuid, text[], boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_agency_active_status(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_agency_level(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_promote_agency_owner_to_payroll_helper(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_set_topup_helper_active(_helper_id uuid, _active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_helper record;
  v_agency record;
  v_tier_rate numeric;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['topup-system','finance-hub','manual-topup','user-management'], true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Topup/finance permission required');
  END IF;
  IF _helper_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing helper id');
  END IF;

  SELECT * INTO v_helper FROM public.topup_helpers WHERE id = _helper_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found');
  END IF;
  IF public._is_target_user_owner(v_helper.user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change owner account helper status');
  END IF;

  UPDATE public.topup_helpers
     SET is_active = COALESCE(_active, false), updated_at = now()
   WHERE id = _helper_id;

  IF COALESCE(v_helper.trader_level, 0) = 5 AND COALESCE(v_helper.payroll_enabled, false) THEN
    SELECT * INTO v_agency FROM public.agencies WHERE owner_id = v_helper.user_id LIMIT 1;
    IF FOUND THEN
      IF COALESCE(_active, false) THEN
        v_tier_rate := 12;
      ELSE
        SELECT commission_rate INTO v_tier_rate
        FROM public.agency_level_tiers
        WHERE level_code = COALESCE(
          (CASE v_agency.level
            WHEN 'A1' THEN 'bronze'
            WHEN 'A2' THEN 'silver'
            WHEN 'A3' THEN 'gold'
            WHEN 'A4' THEN 'platinum'
            WHEN 'A5' THEN 'diamond'
            ELSE v_agency.level
          END),
          'bronze'
        )
        AND is_active = true
        LIMIT 1;
        v_tier_rate := COALESCE(v_tier_rate, 3);
      END IF;

      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies
         SET commission_rate = v_tier_rate, updated_at = now()
       WHERE id = v_agency.id;
      PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_admin_id, CASE WHEN COALESCE(_active,false) THEN 'topup_helper_activated' ELSE 'topup_helper_deactivated' END, 'topup_helper', _helper_id, jsonb_build_object('user_id', v_helper.user_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'is_active', COALESCE(_active, false));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_topup_helper_level(_helper_id uuid, _level integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_helper record;
  v_old_level integer;
  v_new_level integer;
  v_new_payroll boolean;
  v_agency record;
  v_tier_rate numeric;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['topup-system','finance-hub','manual-topup','user-management'], true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Topup/finance permission required');
  END IF;
  IF _helper_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing helper id');
  END IF;
  IF _level IS NULL OR _level < 1 OR _level > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid helper level');
  END IF;

  SELECT * INTO v_helper FROM public.topup_helpers WHERE id = _helper_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found');
  END IF;
  IF public._is_target_user_owner(v_helper.user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change owner account helper level');
  END IF;

  v_old_level := COALESCE(v_helper.trader_level, 1);
  v_new_level := _level;
  v_new_payroll := v_new_level >= 5;

  UPDATE public.topup_helpers
     SET trader_level = v_new_level,
         payroll_enabled = v_new_payroll,
         updated_at = now()
   WHERE id = _helper_id;

  SELECT * INTO v_agency FROM public.agencies WHERE owner_id = v_helper.user_id LIMIT 1;
  IF FOUND THEN
    IF v_new_payroll AND COALESCE(v_helper.is_active, false) THEN
      v_tier_rate := 12;
    ELSE
      SELECT commission_rate INTO v_tier_rate
      FROM public.agency_level_tiers
      WHERE level_code = COALESCE(
        (CASE v_agency.level
          WHEN 'A1' THEN 'bronze'
          WHEN 'A2' THEN 'silver'
          WHEN 'A3' THEN 'gold'
          WHEN 'A4' THEN 'platinum'
          WHEN 'A5' THEN 'diamond'
          ELSE v_agency.level
        END),
        'bronze'
      )
      AND is_active = true
      LIMIT 1;
      v_tier_rate := COALESCE(v_tier_rate, 3);
    END IF;

    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
    UPDATE public.agencies
       SET commission_rate = v_tier_rate, updated_at = now()
     WHERE id = v_agency.id;
    PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);
  END IF;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (
      v_admin_id,
      'topup_helper_level_changed',
      'topup_helper',
      _helper_id,
      jsonb_build_object(
        'user_id', v_helper.user_id,
        'old_level', v_old_level,
        'new_level', v_new_level,
        'payroll_enabled', v_new_payroll
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'trader_level', v_new_level, 'payroll_enabled', v_new_payroll);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_topup_helper_level(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_topup_helper_level(uuid, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_topup_helper_level(uuid, integer) IS
'Pkg378: secure admin helper level change RPC; replaces direct topup_helpers update and keeps Level 5 payroll agency commission in sync.';
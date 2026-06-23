CREATE OR REPLACE FUNCTION public.create_agency_for_user(
  _owner_id uuid,
  _name text,
  _agency_code text,
  _level text DEFAULT 'A1'::text,
  _commission_rate numeric DEFAULT 3,
  _email text DEFAULT NULL::text,
  _whatsapp text DEFAULT NULL::text,
  _verified_token text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_agency_id uuid;
  _profile record;
  _caller uuid := auth.uid();
  _role_legacy text := current_setting('request.jwt.claim.role', true);
  _claims_raw text := current_setting('request.jwt.claims', true);
  _role_new text := NULL;
  _is_service boolean := false;
  _is_privileged boolean;
  _clean_code text := upper(regexp_replace(trim(COALESCE(_agency_code, '')), '[^A-Z0-9]', '', 'g'));
  _clean_name text := trim(COALESCE(_name, ''));
  _final_level text := 'A1';
  _final_commission numeric := 3;
  _tier record;
  _is_payroll_l5 boolean := false;
  _consumed_otp_id uuid;
BEGIN
  IF _claims_raw IS NOT NULL AND _claims_raw <> '' THEN
    BEGIN _role_new := (_claims_raw::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN _role_new := NULL; END;
  END IF;
  _is_service := _role_legacy = 'service_role' OR _role_new = 'service_role'
              OR session_user = 'service_role' OR current_user = 'service_role';

  _is_privileged := _is_service OR public.is_active_admin_session() OR (_caller IS NOT NULL AND public.is_admin(_caller));

  IF NOT (_is_privileged OR (_caller IS NOT NULL AND _caller = _owner_id)) THEN
    RAISE EXCEPTION 'Not authorized to create an agency for another user';
  END IF;

  IF length(_clean_name) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency name is required');
  END IF;
  IF length(_clean_code) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code must be at least 4 characters');
  END IF;

  -- NEW: enforce in-app OTP for non-privileged callers.
  IF NOT _is_privileged THEN
    IF _verified_token IS NULL OR length(_verified_token) < 32 THEN
      RETURN jsonb_build_object('success', false, 'error', 'In-app OTP verification is required');
    END IF;

    _consumed_otp_id := public.consume_agency_app_otp_token(_owner_id, _verified_token, 'agency_verification');
    IF _consumed_otp_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'In-app OTP expired or already used. Please request a new code.');
    END IF;
  END IF;

  SELECT id, agency_id, is_agency_owner INTO _profile
  FROM public.profiles
  WHERE id = _owner_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User profile not found'); END IF;
  IF COALESCE(_profile.is_agency_owner, false) THEN RETURN jsonb_build_object('success', false, 'error', 'User already owns an agency'); END IF;
  IF _profile.agency_id IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User is already part of an agency'); END IF;

  IF EXISTS (SELECT 1 FROM public.agencies WHERE upper(agency_code) = _clean_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  END IF;

  IF _is_privileged THEN
    _final_level := COALESCE(NULLIF(trim(_level), ''), 'A1');
    _final_commission := LEAST(GREATEST(COALESCE(_commission_rate, 3), 0), 100);
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.topup_helpers
      WHERE user_id = _owner_id AND trader_level = 5 AND payroll_enabled = true AND is_verified = true AND is_active = true
    ) INTO _is_payroll_l5;
    _final_level := CASE WHEN _is_payroll_l5 THEN 'A5' ELSE 'A1' END;
  END IF;

  SELECT * INTO _tier
  FROM public.agency_level_tiers
  WHERE level_code = _final_level AND COALESCE(is_active, true) = true
  LIMIT 1;
  IF FOUND THEN
    _final_commission := COALESCE(_tier.commission_rate, _final_commission);
  ELSIF NOT _is_privileged THEN
    _final_level := 'A1';
    _final_commission := 3;
  END IF;

  INSERT INTO public.agencies (
    name, agency_code, owner_id, level, commission_rate, email, whatsapp_number,
    wallet_balance, diamond_balance, beans_balance, total_hosts, total_agents, is_active
  ) VALUES (
    _clean_name, _clean_code, _owner_id, _final_level, _final_commission,
    NULLIF(trim(COALESCE(_email, '')), ''), NULLIF(trim(COALESCE(_whatsapp, '')), ''),
    0, 0, 0, 0, 0, true
  ) RETURNING id INTO _new_agency_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET is_agency_owner = true, agency_id = _new_agency_id WHERE id = _owner_id;

  RETURN jsonb_build_object('success', true, 'agency_id', _new_agency_id, 'agency_code', _clean_code, 'level', _final_level, 'commission_rate', _final_commission);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(SQLERRM, 'Failed to create agency'));
END;
$function$;

-- 1) Drop the legacy 7-arg create_agency_for_user so users cannot bypass the OTP gate
DROP FUNCTION IF EXISTS public.create_agency_for_user(uuid, text, text, text, numeric, text, text);

-- 2) Add OTP enforcement to create_sub_agent (sub-agency creation in-app)
CREATE OR REPLACE FUNCTION public.create_sub_agent(
  _agency_id uuid,
  _user_id uuid,
  _name text,
  _commission_rate numeric DEFAULT 5,
  _verified_token text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _new_id uuid;
  _caller uuid := auth.uid();
  _role_legacy text := current_setting('request.jwt.claim.role', true);
  _claims_raw text := current_setting('request.jwt.claims', true);
  _role_new text := NULL;
  _is_service boolean := false;
  _is_privileged boolean;
  _agency record;
  _profile record;
  _ref_code text;
  _consumed_otp_id uuid;
BEGIN
  IF _claims_raw IS NOT NULL AND _claims_raw <> '' THEN
    BEGIN _role_new := (_claims_raw::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN _role_new := NULL; END;
  END IF;
  _is_service := _role_legacy = 'service_role' OR _role_new = 'service_role'
              OR session_user = 'service_role' OR current_user = 'service_role';
  _is_privileged := _is_service OR public.is_active_admin_session() OR (_caller IS NOT NULL AND public.is_admin(_caller));

  IF NOT (_is_privileged OR (_caller IS NOT NULL AND _caller = _user_id)) THEN
    RAISE EXCEPTION 'Not authorized to create a sub-agent for another user';
  END IF;

  -- In-app OTP required for non-privileged callers
  IF NOT _is_privileged THEN
    IF _verified_token IS NULL OR length(_verified_token) < 32 THEN
      RAISE EXCEPTION 'In-app OTP verification is required';
    END IF;
    _consumed_otp_id := public.consume_agency_app_otp_token(_user_id, _verified_token, 'sub_agency_verification');
    IF _consumed_otp_id IS NULL THEN
      RAISE EXCEPTION 'In-app OTP expired or already used. Please request a new code.';
    END IF;
  END IF;

  SELECT id, agency_code, is_active INTO _agency
  FROM public.agencies WHERE id = _agency_id;
  IF NOT FOUND OR NOT COALESCE(_agency.is_active, true) THEN
    RAISE EXCEPTION 'Agency not found or inactive';
  END IF;

  SELECT id, agency_id, is_agency_owner INTO _profile
  FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF COALESCE(_profile.is_agency_owner, false) THEN RAISE EXCEPTION 'User already owns an agency'; END IF;

  IF EXISTS (SELECT 1 FROM public.sub_agents WHERE user_id = _user_id AND status = 'active') THEN
    RAISE EXCEPTION 'User is already an active sub-agent';
  END IF;

  _ref_code := public.generate_sub_agent_referral_code();

  INSERT INTO public.sub_agents (agency_id, user_id, name, commission_rate, referral_code, status)
  VALUES (_agency_id, _user_id, trim(_name), LEAST(GREATEST(COALESCE(_commission_rate, 5), 0), 100), _ref_code, 'active')
  RETURNING id INTO _new_id;

  RETURN _new_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Sub-agent already exists for this user';
END;
$function$;

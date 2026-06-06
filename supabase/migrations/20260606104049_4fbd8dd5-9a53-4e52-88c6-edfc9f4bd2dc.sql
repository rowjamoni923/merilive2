-- Pkg430: every agency owner gets a Trader Wallet (topup_helpers row) automatically.

CREATE OR REPLACE FUNCTION public.create_agency_for_user(
  _owner_id uuid,
  _name text,
  _agency_code text,
  _level text DEFAULT 'A1'::text,
  _commission_rate numeric DEFAULT 3,
  _email text DEFAULT NULL::text,
  _whatsapp text DEFAULT NULL::text
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
  _jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  _is_privileged boolean;
  _clean_code text := upper(regexp_replace(trim(COALESCE(_agency_code, '')), '[^A-Z0-9]', '', 'g'));
  _clean_name text := trim(COALESCE(_name, ''));
  _final_level text := 'A1';
  _final_commission numeric := 3;
  _tier record;
  _is_payroll_l5 boolean := false;
  _owner_country text;
BEGIN
  _is_privileged := (_jwt_role = 'service_role') OR public.is_active_admin_session() OR (_caller IS NOT NULL AND public.is_admin(_caller));

  IF NOT (_is_privileged OR (_caller IS NOT NULL AND _caller = _owner_id)) THEN
    RAISE EXCEPTION 'Not authorized to create an agency for another user';
  END IF;

  IF length(_clean_name) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency name is required');
  END IF;
  IF length(_clean_code) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code must be at least 4 characters');
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
    _clean_name, _clean_code, _owner_id, _final_level, _final_commission, NULLIF(trim(COALESCE(_email, '')), ''), NULLIF(trim(COALESCE(_whatsapp, '')), ''),
    0, 0, 0, 0, 0, true
  ) RETURNING id INTO _new_agency_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET is_agency_owner = true, agency_id = _new_agency_id WHERE id = _owner_id;

  -- Pkg430: auto-provision Trader Wallet (3rd wallet) for the new owner.
  -- Idempotent — if a topup_helpers row already exists for this user, leave it alone.
  SELECT COALESCE(country_code, 'BD') INTO _owner_country FROM public.profiles WHERE id = _owner_id;
  INSERT INTO public.topup_helpers (
    user_id, country_code, supported_countries,
    is_active, is_verified, trader_level, payroll_enabled,
    wallet_balance, is_listed
  )
  VALUES (
    _owner_id, COALESCE(_owner_country, 'BD'), ARRAY[COALESCE(_owner_country, 'BD')],
    true, false, 1, false,
    0, false
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'agency_id', _new_agency_id, 'agency_code', _clean_code, 'level', _final_level, 'commission_rate', _final_commission);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(SQLERRM, 'Failed to create agency'));
END;
$function$;

-- Backfill: every existing agency owner that doesn't yet have a Trader Wallet gets one now.
INSERT INTO public.topup_helpers (
  user_id, country_code, supported_countries,
  is_active, is_verified, trader_level, payroll_enabled,
  wallet_balance, is_listed
)
SELECT
  a.owner_id,
  COALESCE(p.country_code, 'BD'),
  ARRAY[COALESCE(p.country_code, 'BD')],
  true, false, 1, false,
  0, false
FROM public.agencies a
LEFT JOIN public.profiles p ON p.id = a.owner_id
WHERE a.owner_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.topup_helpers th WHERE th.user_id = a.owner_id)
ON CONFLICT (user_id) DO NOTHING;
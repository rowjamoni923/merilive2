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

  -- Pkg431: NO automatic Trader Wallet. Owner must apply for L1 helper.

  RETURN jsonb_build_object('success', true, 'agency_id', _new_agency_id, 'agency_code', _clean_code, 'level', _final_level, 'commission_rate', _final_commission);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(SQLERRM, 'Failed to create agency'));
END;
$function$;

DELETE FROM public.topup_helpers th
WHERE th.is_verified = false
  AND th.trader_level = 1
  AND th.payroll_enabled = false
  AND COALESCE(th.wallet_balance, 0) = 0
  AND COALESCE(th.total_bought, 0)   = 0
  AND COALESCE(th.total_sold, 0)     = 0
  AND COALESCE(th.total_earnings, 0) = 0
  AND th.approved_at IS NULL
  AND th.approved_by IS NULL
  AND th.payroll_applied_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.helper_orders             ho WHERE ho.helper_id = th.id)
  AND NOT EXISTS (SELECT 1 FROM public.helper_transactions       ht WHERE ht.helper_id = th.id)
  AND NOT EXISTS (SELECT 1 FROM public.helper_topup_requests     hr WHERE hr.helper_id = th.id)
  AND NOT EXISTS (SELECT 1 FROM public.helper_withdrawal_requests hw WHERE hw.helper_id = th.id)
  AND NOT EXISTS (SELECT 1 FROM public.helper_upgrade_requests   hu WHERE hu.helper_id = th.id)
  AND NOT EXISTS (SELECT 1 FROM public.trader_level_purchases    tp WHERE tp.trader_id = th.id)
  AND NOT EXISTS (SELECT 1 FROM public.coin_trader_transfers     ct WHERE ct.user_id = th.user_id);
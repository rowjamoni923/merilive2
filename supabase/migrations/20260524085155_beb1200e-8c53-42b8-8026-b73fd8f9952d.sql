-- =========================================================
-- Section #10 deep-audit pass-2 — Agency security hardening
-- =========================================================

-- ---------------------------------------------------------
-- 1) exchange_agency_beans_to_diamonds — recompute server-side, gate to owner
-- ---------------------------------------------------------
DROP FUNCTION IF EXISTS public.exchange_agency_beans_to_diamonds(uuid, bigint, bigint, bigint);

CREATE OR REPLACE FUNCTION public.exchange_agency_beans_to_diamonds(
  p_agency_id uuid,
  p_beans_to_deduct bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_owner_id uuid;
  v_current_beans bigint;
  v_current_diamonds bigint;
  v_new_beans bigint;
  v_new_diamonds bigint;
  v_rate numeric;
  v_fee_pct numeric;
  v_min_exchange bigint;
  v_settings jsonb;
  v_gross_diamonds bigint;
  v_fee_diamonds bigint;
  v_net_diamonds bigint;
BEGIN
  IF p_beans_to_deduct IS NULL OR p_beans_to_deduct <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Load + lock agency
  SELECT owner_id, COALESCE(beans_balance, 0)::bigint, COALESCE(diamond_balance, 0)::bigint
    INTO v_owner_id, v_current_beans, v_current_diamonds
  FROM public.agencies WHERE id = p_agency_id FOR UPDATE;
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  -- Caller gate: owner / admin / service_role only
  IF NOT (v_is_service
          OR (v_caller IS NOT NULL AND v_caller = v_owner_id)
          OR (v_caller IS NOT NULL AND public.is_admin(v_caller))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_current_beans < p_beans_to_deduct THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient beans balance',
                              'current_beans', v_current_beans, 'required_beans', p_beans_to_deduct);
  END IF;

  -- Server-side rate + fee (NEVER trust client)
  SELECT setting_value INTO v_settings FROM public.app_settings WHERE setting_key = 'coin_exchange' LIMIT 1;
  v_rate         := COALESCE(NULLIF((v_settings->>'beans_to_diamonds_rate'),'')::numeric, 1);
  v_fee_pct      := COALESCE(NULLIF((v_settings->>'exchange_fee_percent'),'')::numeric, 0);
  v_min_exchange := COALESCE(NULLIF((v_settings->>'min_exchange_amount'),'')::bigint, 0);

  IF v_min_exchange > 0 AND p_beans_to_deduct < v_min_exchange THEN
    RETURN jsonb_build_object('success', false, 'error', 'Below minimum exchange amount',
                              'min_required', v_min_exchange);
  END IF;

  v_gross_diamonds := FLOOR(p_beans_to_deduct::numeric * v_rate)::bigint;
  v_fee_diamonds   := FLOOR(v_gross_diamonds::numeric * v_fee_pct / 100.0)::bigint;
  v_net_diamonds   := GREATEST(v_gross_diamonds - v_fee_diamonds, 0);

  v_new_beans    := v_current_beans - p_beans_to_deduct;
  v_new_diamonds := v_current_diamonds + v_net_diamonds;

  UPDATE public.agencies
     SET beans_balance = v_new_beans, diamond_balance = v_new_diamonds, updated_at = now()
   WHERE id = p_agency_id;

  INSERT INTO public.agency_diamond_transactions
    (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount)
  VALUES
    (p_agency_id, 'exchange', p_beans_to_deduct, v_net_diamonds, v_fee_diamonds);

  RETURN jsonb_build_object(
    'success', true,
    'old_beans', v_current_beans,
    'new_beans', v_new_beans,
    'old_diamonds', v_current_diamonds,
    'new_diamonds', v_new_diamonds,
    'deducted_beans', p_beans_to_deduct,
    'added_diamonds', v_net_diamonds,
    'fee_diamonds', v_fee_diamonds,
    'rate', v_rate,
    'fee_percent', v_fee_pct
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.exchange_agency_beans_to_diamonds(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exchange_agency_beans_to_diamonds(uuid, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------
-- 2) create_sub_agent — self-only (or admin/service)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sub_agent(
  _agency_id uuid,
  _user_id uuid,
  _name text,
  _commission_rate numeric DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  _sub_agent_id uuid;
  _referral_code text;
BEGIN
  IF _user_id IS NULL OR _agency_id IS NULL THEN
    RAISE EXCEPTION 'Invalid parameters';
  END IF;

  IF NOT (_is_service
          OR (_caller IS NOT NULL AND _caller = _user_id)
          OR (_caller IS NOT NULL AND public.is_admin(_caller))) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _referral_code := public.generate_sub_agent_referral_code(_agency_id);

  INSERT INTO sub_agents (agency_id, user_id, name, commission_rate, referral_code, status)
  VALUES (_agency_id, _user_id, _name, _commission_rate, _referral_code, 'active')
  RETURNING id INTO _sub_agent_id;

  UPDATE agencies SET total_agents = COALESCE(total_agents, 0) + 1 WHERE id = _agency_id;

  RETURN _sub_agent_id;
END;
$function$;

-- ---------------------------------------------------------
-- 3) credit_sub_agent_commission — internal only
-- ---------------------------------------------------------
REVOKE ALL ON FUNCTION public.credit_sub_agent_commission(uuid, uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_sub_agent_commission(uuid, uuid, numeric, uuid, text) TO service_role;
-- (Other SECURITY DEFINER callers continue to work because they execute as the function owner.)

-- ---------------------------------------------------------
-- 4) get_agency_transfer_history — owner / admin / service only
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_agency_transfer_history(
  _agency_id uuid,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, host_id uuid, host_name text, host_uid character varying,
  amount numeric, gift_earnings numeric, call_earnings numeric,
  commission_rate numeric, transfer_type text, status text,
  period_start timestamp with time zone, period_end timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_owner uuid;
BEGIN
  IF _agency_id IS NULL THEN
    RETURN;
  END IF;

  SELECT owner_id INTO v_owner FROM public.agencies WHERE id = _agency_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  IF NOT (v_is_service
          OR (v_caller IS NOT NULL AND v_caller = v_owner)
          OR (v_caller IS NOT NULL AND public.is_admin(v_caller))) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    aet.id, aet.host_id, aet.host_name, aet.host_uid,
    aet.amount, aet.gift_earnings, aet.call_earnings,
    aet.commission_rate, aet.transfer_type, aet.status,
    aet.period_start, aet.period_end, aet.created_at
  FROM public.agency_earnings_transfers aet
  WHERE aet.agency_id = _agency_id
  ORDER BY aet.created_at DESC
  LIMIT _limit OFFSET _offset;
END;
$function$;

-- ---------------------------------------------------------
-- 5) get_agency_diamond_balance — owner / admin / service only
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_agency_diamond_balance(owner_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  bal bigint;
BEGIN
  IF owner_user_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT (v_is_service
          OR (v_caller IS NOT NULL AND v_caller = owner_user_id)
          OR (v_caller IS NOT NULL AND public.is_admin(v_caller))) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT diamond_balance INTO bal FROM public.agencies WHERE owner_id = owner_user_id LIMIT 1;
  RETURN COALESCE(bal, 0);
END;
$function$;
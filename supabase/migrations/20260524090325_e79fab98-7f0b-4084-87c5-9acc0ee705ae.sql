-- Section #10 pass-3: Agency / Host Applications deep hardening

-- 1) Block direct client tampering of agency protected fields beyond economy balances.
CREATE OR REPLACE FUNCTION public.guard_agency_economy_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_privileged_db_role boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
  v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false) OR COALESCE(public.is_active_admin_session(), false);
  v_bypass boolean := COALESCE(current_setting('app.bypass_agency_economy_guard', true), '') = 'true';
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN v_changed_fields := array_append(v_changed_fields, 'wallet_balance'); END IF;
  IF NEW.beans_balance IS DISTINCT FROM OLD.beans_balance THEN v_changed_fields := array_append(v_changed_fields, 'beans_balance'); END IF;
  IF NEW.diamond_balance IS DISTINCT FROM OLD.diamond_balance THEN v_changed_fields := array_append(v_changed_fields, 'diamond_balance'); END IF;
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN v_changed_fields := array_append(v_changed_fields, 'commission_rate'); END IF;
  IF NEW.level IS DISTINCT FROM OLD.level THEN v_changed_fields := array_append(v_changed_fields, 'level'); END IF;
  IF NEW.total_hosts IS DISTINCT FROM OLD.total_hosts THEN v_changed_fields := array_append(v_changed_fields, 'total_hosts'); END IF;
  IF NEW.total_agents IS DISTINCT FROM OLD.total_agents THEN v_changed_fields := array_append(v_changed_fields, 'total_agents'); END IF;
  IF NEW.parent_agency_id IS DISTINCT FROM OLD.parent_agency_id THEN v_changed_fields := array_append(v_changed_fields, 'parent_agency_id'); END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN v_changed_fields := array_append(v_changed_fields, 'owner_id'); END IF;
  IF NEW.agency_code IS DISTINCT FROM OLD.agency_code THEN v_changed_fields := array_append(v_changed_fields, 'agency_code'); END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN v_changed_fields := array_append(v_changed_fields, 'is_active'); END IF;
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN v_changed_fields := array_append(v_changed_fields, 'is_blocked'); END IF;
  IF NEW.blocked_at IS DISTINCT FROM OLD.blocked_at THEN v_changed_fields := array_append(v_changed_fields, 'blocked_at'); END IF;
  IF NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason THEN v_changed_fields := array_append(v_changed_fields, 'blocked_reason'); END IF;

  IF array_length(v_changed_fields, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_bypass OR v_is_privileged_db_role OR v_is_admin THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.security_events (event_type, severity, user_id, metadata, created_at)
    VALUES (
      'blocked_agency_protected_field_tamper',
      'critical',
      auth.uid(),
      jsonb_build_object('agency_id', OLD.id, 'changed_fields', v_changed_fields),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RAISE EXCEPTION 'Agency protected fields cannot be changed directly';
END;
$function$;

-- 2) Do not trust client-supplied approver ids for host approval.
CREATE OR REPLACE FUNCTION public.approve_host_request(_agency_id uuid, _host_id uuid, _approver_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  _agency_owner_id uuid;
  _agency_name text;
  _referral_code_used text;
  _updated int := 0;
BEGIN
  SELECT owner_id, name INTO _agency_owner_id, _agency_name
  FROM public.agencies
  WHERE id = _agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false;

  IF _agency_owner_id IS NULL THEN RETURN false; END IF;

  IF NOT (
    _jwt_role = 'service_role'
    OR public.is_active_admin_session()
    OR (_caller IS NOT NULL AND _caller = _agency_owner_id AND _approver_id = _caller)
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agency_hosts
    WHERE host_id = _host_id AND status = 'active' AND agency_id IS DISTINCT FROM _agency_id
  ) THEN
    RETURN false;
  END IF;

  SELECT referral_code INTO _referral_code_used
  FROM public.agency_hosts
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending'
  LIMIT 1;

  UPDATE public.agency_hosts
  SET status = 'active', joined_at = COALESCE(joined_at, now())
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated = 0 THEN RETURN false; END IF;

  UPDATE public.agency_host_requests
  SET status = 'approved', updated_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET agency_id = _agency_id WHERE id = _host_id;

  UPDATE public.agencies
  SET total_hosts = (SELECT count(*)::int FROM public.agency_hosts WHERE agency_id = _agency_id AND status = 'active'),
      updated_at = now()
  WHERE id = _agency_id;

  IF _referral_code_used IS NOT NULL AND btrim(_referral_code_used) <> '' THEN
    UPDATE public.sub_agents
    SET total_referrals = COALESCE(total_referrals, 0) + 1
    WHERE referral_code = _referral_code_used AND agency_id = _agency_id AND status = 'active';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (_host_id, 'agency_joined', '🎉 Agency Request Approved!',
    'You have been approved to join ' || COALESCE(_agency_name, 'the agency') || '. Welcome!',
    jsonb_build_object('agency_id', _agency_id, 'agency_name', _agency_name, 'action_url', '/agency'), false);

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_host_request(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _rid uuid; _agency_id uuid; _host_id uuid; _agency_owner_id uuid;
BEGIN
  SELECT r.id, r.agency_id, r.host_id, a.owner_id
    INTO _rid, _agency_id, _host_id, _agency_owner_id
  FROM public.agency_host_requests r
  JOIN public.agencies a ON a.id = r.agency_id
  WHERE r.id = p_request_id AND r.status = 'pending'
  FOR UPDATE;

  IF _rid IS NULL OR _agency_owner_id IS DISTINCT FROM auth.uid() THEN RETURN false; END IF;

  RETURN public.approve_host_request(_agency_id, _host_id, auth.uid());
END;
$function$;

-- 3) Server-side agency creation validation; normal users cannot self-assign A5/high commission.
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

  RETURN jsonb_build_object('success', true, 'agency_id', _new_agency_id, 'agency_code', _clean_code, 'level', _final_level, 'commission_rate', _final_commission);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', COALESCE(SQLERRM, 'Failed to create agency'));
END;
$function$;

-- 4) Sub-agent creation must be via RPC, with server-owned commission and duplicate checks.
CREATE OR REPLACE FUNCTION public.create_sub_agent(_agency_id uuid, _user_id uuid, _name text, _commission_rate numeric DEFAULT 5)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  _is_privileged boolean;
  _sub_agent_id uuid;
  _referral_code text;
  _final_rate numeric := 5;
BEGIN
  _is_privileged := (_jwt_role = 'service_role') OR public.is_active_admin_session() OR (_caller IS NOT NULL AND public.is_admin(_caller));

  IF _user_id IS NULL OR _agency_id IS NULL THEN RAISE EXCEPTION 'Invalid parameters'; END IF;
  IF NOT (_is_privileged OR (_caller IS NOT NULL AND _caller = _user_id)) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agencies WHERE id = _agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false) THEN
    RAISE EXCEPTION 'Agency not found or inactive';
  END IF;

  IF EXISTS (SELECT 1 FROM public.agencies WHERE owner_id = _user_id AND COALESCE(is_active, true) = true) THEN
    RAISE EXCEPTION 'Agency owners cannot become sub-agents';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sub_agents WHERE user_id = _user_id AND status = 'active') THEN
    RAISE EXCEPTION 'User is already an active sub-agent';
  END IF;

  IF _is_privileged THEN
    _final_rate := LEAST(GREATEST(COALESCE(_commission_rate, 5), 0), 100);
  END IF;

  _referral_code := public.generate_sub_agent_referral_code(_agency_id);

  INSERT INTO public.sub_agents (agency_id, user_id, name, commission_rate, referral_code, status)
  VALUES (_agency_id, _user_id, COALESCE(NULLIF(trim(_name), ''), 'Sub-Agent'), _final_rate, _referral_code, 'active')
  RETURNING id INTO _sub_agent_id;

  UPDATE public.agencies
  SET total_agents = (SELECT count(*)::int FROM public.sub_agents WHERE agency_id = _agency_id AND status = 'active'),
      updated_at = now()
  WHERE id = _agency_id;

  RETURN _sub_agent_id;
END;
$function$;

-- 5) Internal upper-agency commission helper is not callable by users.
CREATE OR REPLACE FUNCTION public.credit_sub_agent_commission(_host_id uuid, _agency_id uuid, _host_earnings numeric, _source_id uuid, _source_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  _parent_agency_id uuid;
  _sub_level int;
  _upper_level int;
  _sub_rate numeric;
  _upper_rate numeric;
  _bonus_rate numeric;
  _bonus_beans bigint;
BEGIN
  IF NOT (current_user IN ('postgres', 'service_role', 'supabase_admin') OR _jwt_role = 'service_role' OR public.is_active_admin_session()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF _host_earnings IS NULL OR _host_earnings <= 0 THEN RETURN; END IF;

  SELECT parent_agency_id INTO _parent_agency_id FROM public.agencies WHERE id = _agency_id;
  IF _parent_agency_id IS NULL THEN RETURN; END IF;

  _sub_level := public.get_agency_numeric_level(_agency_id);
  _upper_level := public.get_agency_numeric_level(_parent_agency_id);
  IF _sub_level IS NULL OR _upper_level IS NULL THEN RAISE EXCEPTION 'Sub-agency level configuration is missing'; END IF;
  IF _upper_level <= _sub_level THEN RETURN; END IF;

  _sub_rate := public.get_rate_for_numeric_level(_sub_level);
  _upper_rate := public.get_rate_for_numeric_level(_upper_level);
  IF _sub_rate IS NULL OR _upper_rate IS NULL THEN RAISE EXCEPTION 'Sub-agency commission tier rate is missing'; END IF;

  _bonus_rate := _upper_rate - _sub_rate;
  IF _bonus_rate <= 0 THEN RETURN; END IF;

  _bonus_beans := FLOOR(_host_earnings * _bonus_rate / 100.0)::bigint;
  IF _bonus_beans <= 0 THEN RETURN; END IF;

  INSERT INTO public.agency_commission_history (
    agency_id, host_id, source_transaction_id, transaction_type,
    commission_amount, commission_rate, notes, created_at
  ) VALUES (
    _parent_agency_id, _host_id, _source_id, 'upper_agency_referral_bonus',
    _bonus_beans, _bonus_rate,
    format('Upper L%s bonus from sub L%s host (%s%% - %s%% = %s%%)', _upper_level, _sub_level, _upper_rate, _sub_rate, _bonus_rate),
    now()
  ) ON CONFLICT (source_transaction_id, transaction_type) DO NOTHING;

  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.agencies
  SET beans_balance = COALESCE(beans_balance, 0) + _bonus_beans,
      updated_at = now()
  WHERE id = _parent_agency_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.credit_sub_agent_commission(uuid, uuid, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_sub_agent_commission(uuid, uuid, numeric, uuid, text) TO service_role;

-- 6) RLS cleanup for sub-agent flows.
DROP POLICY IF EXISTS "u_ins_sub_agent" ON public.sub_agents;
DROP POLICY IF EXISTS "u_upd_sub_agent" ON public.sub_agents;
DROP POLICY IF EXISTS "Users can read own sub agent" ON public.sub_agents;
DROP POLICY IF EXISTS "Agency owners can read sub agents" ON public.sub_agents;
CREATE POLICY "Users can read own sub agent"
ON public.sub_agents FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Agency owners can read sub agents"
ON public.sub_agents FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = sub_agents.agency_id AND a.owner_id = auth.uid()));

DROP POLICY IF EXISTS "u_read_sub_comm" ON public.sub_agent_commissions;
DROP POLICY IF EXISTS "Sub-agent owners can read own commissions" ON public.sub_agent_commissions;
DROP POLICY IF EXISTS "Agency owners can read sub-agent commissions" ON public.sub_agent_commissions;
CREATE POLICY "Sub-agent owners can read own commissions"
ON public.sub_agent_commissions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.sub_agents sa WHERE sa.id = sub_agent_commissions.sub_agent_id AND sa.user_id = auth.uid()));
CREATE POLICY "Agency owners can read sub-agent commissions"
ON public.sub_agent_commissions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sub_agents sa
  JOIN public.agencies a ON a.id = sa.agency_id
  WHERE sa.id = sub_agent_commissions.sub_agent_id AND a.owner_id = auth.uid()
));

-- 7) Safer helper function for agent counts; no arbitrary public increments.
CREATE OR REPLACE FUNCTION public.increment_agency_agents(agency_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF NOT (_jwt_role = 'service_role' OR public.is_active_admin_session() OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid()))) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.agencies
  SET total_agents = (SELECT count(*)::int FROM public.sub_agents WHERE agency_id = agency_uuid AND status = 'active'),
      updated_at = now()
  WHERE id = agency_uuid;
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_agency_agents(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_agency_agents(uuid) TO service_role;

-- 8) Add uniqueness protections only when current data is clean.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM (SELECT upper(agency_code) AS code, count(*) FROM public.agencies GROUP BY upper(agency_code) HAVING count(*) > 1) d
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS agencies_agency_code_upper_unique ON public.agencies (upper(agency_code));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (SELECT host_id, count(*) FROM public.agency_hosts WHERE status = 'active' GROUP BY host_id HAVING count(*) > 1) d
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS agency_hosts_one_active_per_host ON public.agency_hosts (host_id) WHERE status = 'active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM (SELECT user_id, count(*) FROM public.sub_agents WHERE status = 'active' GROUP BY user_id HAVING count(*) > 1) d
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS sub_agents_one_active_per_user ON public.sub_agents (user_id) WHERE status = 'active';
  END IF;
END;
$do$;
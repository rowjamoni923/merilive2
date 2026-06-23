-- Phase C: align agency host RPCs with modern service_role detection.

CREATE OR REPLACE FUNCTION public.approve_host_request(_agency_id uuid, _host_id uuid, _approver_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _role_legacy text := current_setting('request.jwt.claim.role', true);
  _claims_raw text := current_setting('request.jwt.claims', true);
  _role_new text := NULL;
  _is_service boolean := false;
  _agency_owner_id uuid;
  _agency_name text;
  _referral_code_used text;
  _updated int := 0;
BEGIN
  IF _claims_raw IS NOT NULL AND _claims_raw <> '' THEN
    BEGIN
      _role_new := (_claims_raw::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN _role_new := NULL; END;
  END IF;
  _is_service := _role_legacy = 'service_role'
              OR _role_new = 'service_role'
              OR session_user = 'service_role'
              OR current_user = 'service_role';

  SELECT owner_id, name INTO _agency_owner_id, _agency_name
  FROM public.agencies
  WHERE id = _agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false;
  IF _agency_owner_id IS NULL THEN RETURN false; END IF;

  IF NOT (
    _is_service
    OR public.is_active_admin_session()
    OR (_caller IS NOT NULL AND _caller = _agency_owner_id AND _approver_id = _caller)
  ) THEN RETURN false; END IF;

  IF EXISTS (
    SELECT 1 FROM public.agency_hosts
    WHERE host_id = _host_id AND status = 'active' AND agency_id IS DISTINCT FROM _agency_id
  ) THEN RETURN false; END IF;

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

CREATE OR REPLACE FUNCTION public.reject_host_request(_agency_id uuid, _host_id uuid, _rejector_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_role_legacy text := current_setting('request.jwt.claim.role', true);
  v_claims_raw text := current_setting('request.jwt.claims', true);
  v_role_new text := NULL;
  v_is_service boolean := false;
  v_owner_id uuid; v_agency_name text; v_updated int := 0;
BEGIN
  IF v_claims_raw IS NOT NULL AND v_claims_raw <> '' THEN
    BEGIN v_role_new := (v_claims_raw::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN v_role_new := NULL; END;
  END IF;
  v_is_service := v_role_legacy = 'service_role' OR v_role_new = 'service_role'
               OR session_user = 'service_role' OR current_user = 'service_role';

  SELECT owner_id, name INTO v_owner_id, v_agency_name
  FROM public.agencies
  WHERE id = _agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false;
  IF v_owner_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Agency not found'); END IF;

  IF NOT (v_is_service OR public.is_active_admin_session()
    OR (v_caller IS NOT NULL AND v_caller = v_owner_id AND _rejector_id = v_caller)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.agency_hosts SET status = 'rejected', left_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Request not found'); END IF;

  UPDATE public.agency_host_requests SET status = 'rejected', updated_at = now()
  WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (_host_id, 'agency_host_rejected', '❌ Agency Request Rejected',
    'Your request to join ' || COALESCE(v_agency_name, 'the agency') || ' was declined.',
    jsonb_build_object('agency_id', _agency_id, 'agency_name', v_agency_name, 'action_url', '/agency'),
    false, now());
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_agency(_host_id uuid, _agency_code text, _joined_via text DEFAULT 'code'::text, _referral_code text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_id uuid; v_agency_name text; v_owner_id uuid; v_existing_id uuid; v_existing_status text;
  v_referral_code text; v_sub_agent_agency uuid; v_caller uuid := auth.uid();
  v_role_legacy text := current_setting('request.jwt.claim.role', true);
  v_claims_raw text := current_setting('request.jwt.claims', true);
  v_role_new text := NULL;
  v_is_service boolean := false;
  v_joined_via text := left(COALESCE(NULLIF(trim(_joined_via), ''), 'code'), 40);
BEGIN
  IF v_claims_raw IS NOT NULL AND v_claims_raw <> '' THEN
    BEGIN v_role_new := (v_claims_raw::jsonb) ->> 'role';
    EXCEPTION WHEN OTHERS THEN v_role_new := NULL; END;
  END IF;
  v_is_service := v_role_legacy = 'service_role' OR v_role_new = 'service_role'
               OR session_user = 'service_role' OR current_user = 'service_role';

  IF NOT v_is_service AND NOT public.is_active_admin_session() AND v_caller IS DISTINCT FROM _host_id THEN
    RAISE EXCEPTION 'Not authorized to join agency for another user';
  END IF;
  IF _host_id IS NULL OR trim(COALESCE(_agency_code, '')) = '' THEN RAISE EXCEPTION 'Invalid agency join request'; END IF;

  SELECT id, name, owner_id INTO v_agency_id, v_agency_name, v_owner_id
  FROM public.agencies
  WHERE upper(agency_code) = upper(trim(_agency_code)) AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false
  LIMIT 1;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Agency not found or inactive'; END IF;
  IF v_owner_id = _host_id THEN RAISE EXCEPTION 'Agency owner cannot join their own agency as host'; END IF;

  v_referral_code := NULLIF(upper(trim(COALESCE(_referral_code, ''))), '');
  IF v_referral_code IS NOT NULL THEN
    SELECT agency_id INTO v_sub_agent_agency FROM public.sub_agents WHERE referral_code = v_referral_code AND status = 'active' LIMIT 1;
    IF v_sub_agent_agency IS DISTINCT FROM v_agency_id THEN v_referral_code := NULL; END IF;
  END IF;

  SELECT id, status INTO v_existing_id, v_existing_status FROM public.agency_hosts WHERE host_id = _host_id ORDER BY joined_at DESC NULLS LAST, id DESC LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'active' THEN RAISE EXCEPTION 'Already a member of an agency'; END IF;
    IF v_existing_status = 'pending' AND EXISTS (SELECT 1 FROM public.agency_hosts WHERE host_id = _host_id AND agency_id = v_agency_id AND status = 'pending') THEN
      RAISE EXCEPTION 'Join request already pending';
    END IF;
    DELETE FROM public.agency_hosts WHERE host_id = _host_id AND status IN ('rejected', 'left', 'removed', 'pending');
    UPDATE public.agency_host_requests SET status = 'cancelled', updated_at = now() WHERE host_id = _host_id AND status = 'pending';
  END IF;

  INSERT INTO public.agency_hosts (host_id, agency_id, status, joined_via, joined_at, referral_code)
  VALUES (_host_id, v_agency_id, 'pending', v_joined_via, now(), v_referral_code);

  INSERT INTO public.agency_host_requests (agency_id, host_id, status, created_at, updated_at)
  VALUES (v_agency_id, _host_id, 'pending', now(), now())
  ON CONFLICT (agency_id, host_id) WHERE status = 'pending' DO UPDATE SET updated_at = excluded.updated_at;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (v_owner_id, 'agency_host_request', '🔔 New Host Join Request',
    'A host wants to join ' || COALESCE(v_agency_name, 'your agency') || '. Tap to approve or reject.',
    jsonb_build_object('agency_id', v_agency_id, 'host_id', _host_id, 'action_url', '/agency-host-management'), false, now());
  RETURN true;
END;
$function$;
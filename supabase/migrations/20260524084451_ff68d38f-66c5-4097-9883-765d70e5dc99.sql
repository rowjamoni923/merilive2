-- =====================================================================
-- Section #10 — Agency / Host Applications deep audit
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) cancel_agency_request  — require self / admin / service_role
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_agency_request(_host_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
BEGIN
  IF v_jwt_role <> 'service_role'
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM _host_id THEN
    RAISE EXCEPTION 'Not authorized to cancel this agency request';
  END IF;

  DELETE FROM agency_hosts WHERE host_id = _host_id AND status = 'pending';
  RETURN FOUND;
END;
$function$;

-- ---------------------------------------------------------------------
-- 2) join_agency  — require self / admin / service_role
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_agency(
  _host_id uuid,
  _agency_code text,
  _joined_via text DEFAULT 'code'::text,
  _referral_code text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_id uuid;
  v_existing_id uuid;
  v_existing_status text;
  v_referral_code text;
  v_sub_agent_agency uuid;
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
BEGIN
  IF v_jwt_role <> 'service_role'
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM _host_id THEN
    RAISE EXCEPTION 'Not authorized to join agency for another user';
  END IF;

  SELECT id INTO v_agency_id
  FROM agencies
  WHERE agency_code = _agency_code AND is_active = true;

  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency not found or inactive';
  END IF;

  v_referral_code := NULLIF(trim(_referral_code), '');
  IF v_referral_code IS NOT NULL THEN
    SELECT agency_id INTO v_sub_agent_agency
    FROM sub_agents
    WHERE referral_code = upper(v_referral_code) AND status = 'active'
    LIMIT 1;

    IF v_sub_agent_agency IS DISTINCT FROM v_agency_id THEN
      v_referral_code := NULL;
    ELSE
      v_referral_code := upper(v_referral_code);
    END IF;
  END IF;

  SELECT id, status INTO v_existing_id, v_existing_status
  FROM agency_hosts
  WHERE host_id = _host_id
  ORDER BY joined_at DESC NULLS LAST, id DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'active' THEN
      RAISE EXCEPTION 'Already a member of an agency';
    END IF;

    IF v_existing_status = 'pending' THEN
      IF EXISTS (
        SELECT 1 FROM agency_hosts
        WHERE host_id = _host_id AND agency_id = v_agency_id AND status = 'pending'
      ) THEN
        RAISE EXCEPTION 'Join request already pending';
      END IF;
    END IF;

    DELETE FROM agency_hosts
    WHERE host_id = _host_id AND status IN ('rejected', 'left', 'removed', 'pending');
  END IF;

  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at, referral_code)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW(), v_referral_code);

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) create_agency_for_user  — require self / admin / service_role
-- ---------------------------------------------------------------------
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
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
BEGIN
  IF v_jwt_role <> 'service_role'
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM _owner_id THEN
    RAISE EXCEPTION 'Not authorized to create an agency for another user';
  END IF;

  SELECT id, agency_id, is_agency_owner
  INTO _profile
  FROM public.profiles
  WHERE id = _owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User profile not found');
  END IF;

  IF COALESCE(_profile.is_agency_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User already owns an agency');
  END IF;

  IF _profile.agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already part of an agency');
  END IF;

  IF EXISTS (SELECT 1 FROM public.agencies WHERE agency_code = _agency_code) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code already exists');
  END IF;

  INSERT INTO public.agencies (
    name, agency_code, owner_id, level, commission_rate, email, whatsapp_number,
    wallet_balance, diamond_balance, beans_balance, total_hosts, total_agents, is_active
  ) VALUES (
    _name, _agency_code, _owner_id, _level, _commission_rate, _email, _whatsapp,
    0, 0, 0, 0, 0, true
  )
  RETURNING id INTO _new_agency_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
  SET is_agency_owner = true, agency_id = _new_agency_id
  WHERE id = _owner_id;

  RETURN jsonb_build_object('success', true, 'agency_id', _new_agency_id, 'agency_code', _agency_code);
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('success', false, 'error', COALESCE(SQLERRM, 'Failed to create agency'));
END;
$function$;

-- ---------------------------------------------------------------------
-- 4) get_host_agency_request  — require self / admin / agency-owner / service
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_host_agency_request(_host_id uuid)
RETURNS TABLE(id uuid, agency_id uuid, host_id uuid, status text, joined_at timestamp with time zone, agency_name text, agency_code text, agency_logo text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
BEGIN
  IF v_jwt_role <> 'service_role'
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM _host_id
     AND NOT EXISTS (
       SELECT 1 FROM agency_hosts ah
       JOIN agencies a ON a.id = ah.agency_id
       WHERE ah.host_id = _host_id AND a.owner_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'Not authorized to read agency requests for this host';
  END IF;

  RETURN QUERY
  SELECT ah.id, ah.agency_id, ah.host_id, ah.status, ah.joined_at,
         a.name, a.agency_code, a.logo_url
  FROM agency_hosts ah
  JOIN agencies a ON a.id = ah.agency_id
  WHERE ah.host_id = _host_id
  ORDER BY ah.joined_at DESC;
END;
$function$;

-- ---------------------------------------------------------------------
-- 5) admin_process_host_application  — validate status, fill audit cols,
--    stop bypassing face-verify, drop duplicate notification (trigger owns it)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_process_host_application(
  _application_id uuid,
  _status text,
  _processed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _application RECORD;
  _user_id uuid;
  _clean_status text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required.';
  END IF;

  _clean_status := lower(trim(coalesce(_status, '')));
  IF _clean_status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'Invalid status: %', _status;
  END IF;

  SELECT * INTO _application FROM host_applications WHERE id = _application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Application not found');
  END IF;

  _user_id := _application.user_id;

  UPDATE host_applications
  SET status      = _clean_status,
      reviewed_by = coalesce(_processed_by, auth.uid()),
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = _application_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _clean_status = 'approved' THEN
    -- NOTE: is_face_verified is intentionally NOT flipped here; it must
    -- come from the face-verification pipeline, not from host approval.
    UPDATE profiles
    SET is_host = true, host_status = 'approved', updated_at = now()
    WHERE id = _user_id;
  ELSIF _clean_status = 'rejected' THEN
    UPDATE profiles
    SET host_status = 'rejected', updated_at = now()
    WHERE id = _user_id;
  END IF;

  -- Notification is emitted by the notify_on_host_application_status trigger,
  -- so we no longer insert a duplicate here.

  PERFORM log_admin_action('process_host_application', 'host_application', _application_id,
    jsonb_build_object('status', _clean_status, 'user_id', _user_id));

  RETURN jsonb_build_object('success', true, 'status', _clean_status);
END;
$function$;

-- ---------------------------------------------------------------------
-- 6) host_applications  — add user-self RLS so the user-facing flow works
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own host application"      ON public.host_applications;
DROP POLICY IF EXISTS "Users can submit own host application"    ON public.host_applications;
DROP POLICY IF EXISTS "Users can update own pending host application" ON public.host_applications;

CREATE POLICY "Users can view own host application"
  ON public.host_applications
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can submit own host application"
  ON public.host_applications
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND coalesce(status, 'pending') = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND admin_notes IS NULL
  );

CREATE POLICY "Users can update own pending host application"
  ON public.host_applications
  FOR UPDATE
  USING (user_id = auth.uid() AND coalesce(status, 'pending') = 'pending')
  WITH CHECK (
    user_id = auth.uid()
    AND coalesce(status, 'pending') = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND admin_notes IS NULL
  );
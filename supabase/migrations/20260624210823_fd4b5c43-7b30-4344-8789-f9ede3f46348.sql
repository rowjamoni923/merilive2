
-- ============================================================
-- 1. PERMANENT AGENCY PROTECTION (admin can mark any agency permanent)
-- ============================================================
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS is_permanent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permanent_reason text,
  ADD COLUMN IF NOT EXISTS permanent_marked_by uuid,
  ADD COLUMN IF NOT EXISTS permanent_marked_at timestamptz;

-- ============================================================
-- 2. CSA TENURE / EXPIRY
-- ============================================================
ALTER TABLE public.country_super_admins
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS tenure_label text;

-- ============================================================
-- 3. Rewrite auto_close_overdue: skip official, CSA (active, non-expired), permanent. Also auto-revoke expired CSAs first.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_close_overdue_agencies()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_reason text := 'Your agency was automatically closed because fewer than 10 hosts were activated within the 30-day activation window.';
BEGIN
  -- 3a. Auto-revoke any CSAs whose tenure has expired
  FOR r IN
    SELECT csa.agency_id, csa.user_id
      FROM public.country_super_admins csa
     WHERE csa.is_active = true
       AND csa.expires_at IS NOT NULL
       AND csa.expires_at < now()
  LOOP
    UPDATE public.country_super_admins
       SET is_active = false, revoked_at = now(), updated_at = now()
     WHERE agency_id = r.agency_id;
    UPDATE public.agencies SET is_country_super_admin = false, updated_at = now()
     WHERE id = r.agency_id;
    DELETE FROM public.user_roles WHERE user_id = r.user_id AND role = 'country_super_admin';
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (r.user_id, 'csa_expired', 'Country Super Admin Expired',
      'Your Country Super Admin tenure has ended. Contact the owner to renew.',
      jsonb_build_object('agency_id', r.agency_id));
  END LOOP;

  -- 3b. Close overdue agencies (skip official / permanent / active CSA)
  FOR r IN
    SELECT id, owner_id, name
      FROM public.agencies
     WHERE activation_status = 'pending'
       AND COALESCE(is_official, false) = false
       AND COALESCE(is_country_super_admin, false) = false
       AND COALESCE(is_permanent, false) = false
       AND activation_deadline IS NOT NULL
       AND activation_deadline < now()
       AND active_host_count < 10
  LOOP
    UPDATE public.agencies
       SET activation_status = 'closed',
           is_active = false,
           is_blocked = true,
           blocked_at = COALESCE(blocked_at, now()),
           blocked_reason = COALESCE(blocked_reason, v_reason),
           closed_at = COALESCE(closed_at, now()),
           closed_reason = COALESCE(closed_reason, v_reason),
           updated_at = now()
     WHERE id = r.id;

    UPDATE public.agency_hosts
       SET status = 'left', left_at = COALESCE(left_at, now())
     WHERE agency_id = r.id AND left_at IS NULL;

    UPDATE public.profiles SET agency_id = NULL WHERE agency_id = r.id;

    IF r.owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (r.owner_id, 'agency_closed', 'Agency Closed', v_reason,
        jsonb_build_object('agency_id', r.id, 'agency_name', r.name, 'reason_code', 'host_activation_timeout'));
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- ============================================================
-- 4. recalc also protects is_permanent
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_agency_activation(p_agency_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer; v_status text; v_protected boolean;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.agency_hosts
   WHERE agency_id = p_agency_id AND status = 'active' AND left_at IS NULL;

  SELECT activation_status,
         (COALESCE(is_official,false) OR COALESCE(is_country_super_admin,false) OR COALESCE(is_permanent,false))
    INTO v_status, v_protected
  FROM public.agencies WHERE id = p_agency_id FOR UPDATE;

  IF v_status IS NULL THEN RETURN; END IF;

  IF v_protected THEN
    UPDATE public.agencies
       SET active_host_count = v_count, activation_status = 'active',
           is_active = true, is_blocked = false, updated_at = now()
     WHERE id = p_agency_id;
    RETURN;
  END IF;

  IF v_status <> 'closed' AND v_count >= 10 THEN
    UPDATE public.agencies
       SET active_host_count = v_count, activation_status = 'active', updated_at = now()
     WHERE id = p_agency_id;
  ELSE
    UPDATE public.agencies SET active_host_count = v_count, updated_at = now()
     WHERE id = p_agency_id;
  END IF;
END;
$function$;

-- ============================================================
-- 5. Admin RPCs: set / unset permanent
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_agency_permanent(
  _agency_id uuid,
  _is_permanent boolean,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can mark agencies permanent';
  END IF;
  IF _is_permanent THEN
    UPDATE public.agencies
       SET is_permanent = true,
           permanent_reason = _reason,
           permanent_marked_by = auth.uid(),
           permanent_marked_at = now(),
           activation_status = CASE WHEN activation_status = 'closed' THEN 'active' ELSE activation_status END,
           is_active = true,
           is_blocked = false,
           blocked_reason = NULL,
           closed_at = NULL,
           closed_reason = NULL,
           updated_at = now()
     WHERE id = _agency_id;
  ELSE
    UPDATE public.agencies
       SET is_permanent = false,
           permanent_reason = NULL,
           updated_at = now()
     WHERE id = _agency_id;
  END IF;
END $$;

-- List permanent agencies (admin only)
CREATE OR REPLACE FUNCTION public.admin_list_permanent_agencies()
RETURNS TABLE (
  id uuid, name text, agency_code text, owner_id uuid,
  owner_display_name text, owner_app_uid text,
  country_code text, active_host_count integer,
  permanent_reason text, permanent_marked_at timestamptz,
  is_country_super_admin boolean, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  RETURN QUERY
  SELECT a.id, a.name, a.agency_code, a.owner_id,
         p.display_name, p.app_uid,
         a.country_code, a.active_host_count,
         a.permanent_reason, a.permanent_marked_at,
         a.is_country_super_admin, a.created_at
    FROM public.agencies a
    LEFT JOIN public.profiles p ON p.id = a.owner_id
   WHERE a.is_permanent = true
   ORDER BY a.permanent_marked_at DESC NULLS LAST;
END $$;

-- ============================================================
-- 6. Grant CSA — now accepts expires_at and tenure_label
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_grant_country_super_admin(
  _agency_id uuid,
  _user_id uuid,
  _email text,
  _country_code text,
  _commission_percent numeric DEFAULT 0,
  _expires_at timestamptz DEFAULT NULL,
  _tenure_label text DEFAULT 'Permanent'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row public.country_super_admins;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can grant Country Super Admin';
  END IF;
  IF _country_code IS NULL OR length(_country_code) < 2 THEN
    RAISE EXCEPTION 'Country code is required';
  END IF;

  INSERT INTO public.country_super_admins
    (user_id, agency_id, country_code, email, commission_percent, is_active,
     assigned_by, expires_at, tenure_label)
  VALUES (_user_id, _agency_id, upper(_country_code), lower(_email),
          COALESCE(_commission_percent,0), true, auth.uid(),
          _expires_at, COALESCE(_tenure_label, 'Permanent'))
  ON CONFLICT (user_id) DO UPDATE SET
    agency_id = EXCLUDED.agency_id,
    country_code = EXCLUDED.country_code,
    email = EXCLUDED.email,
    commission_percent = EXCLUDED.commission_percent,
    expires_at = EXCLUDED.expires_at,
    tenure_label = EXCLUDED.tenure_label,
    is_active = true,
    revoked_at = NULL,
    updated_at = now()
  RETURNING * INTO v_row;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'country_super_admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.agencies
     SET is_country_super_admin = true,
         activation_status = CASE WHEN activation_status = 'closed' THEN 'active' ELSE activation_status END,
         is_active = true,
         is_blocked = false,
         blocked_reason = NULL,
         closed_at = NULL,
         closed_reason = NULL,
         updated_at = now()
   WHERE id = _agency_id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (_user_id, 'csa_granted', 'Country Super Admin Granted',
    'You have been granted Country Super Admin for ' || upper(_country_code) ||
    ' · Tenure: ' || COALESCE(_tenure_label,'Permanent') ||
    CASE WHEN _expires_at IS NULL THEN '' ELSE ' (until ' || to_char(_expires_at,'DD Mon YYYY') || ')' END ||
    '. Log in at /csa-login.',
    jsonb_build_object('country_code', upper(_country_code), 'agency_id', _agency_id,
      'expires_at', _expires_at, 'tenure_label', _tenure_label));

  RETURN to_jsonb(v_row);
END $$;

-- ============================================================
-- 7. CSA context — block expired
-- ============================================================
CREATE OR REPLACE FUNCTION public.csa_get_my_context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE v jsonb;
BEGIN
  SELECT to_jsonb(csa) || jsonb_build_object('agency_name', a.name)
    INTO v
    FROM public.country_super_admins csa
    LEFT JOIN public.agencies a ON a.id = csa.agency_id
   WHERE csa.user_id = auth.uid()
     AND csa.is_active = true
     AND (csa.expires_at IS NULL OR csa.expires_at > now());
  RETURN v;
END $$;

-- ============================================================
-- 8. Country-wide stats RPC for CSA dashboard
-- ============================================================
CREATE OR REPLACE FUNCTION public.csa_country_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE
  v_country text;
  v_agencies int := 0;
  v_active_agencies int := 0;
  v_hosts int := 0;
  v_users int := 0;
  v_helpers_total int := 0;
  v_h_l1 int := 0; v_h_l2 int := 0; v_h_l3 int := 0; v_h_l4 int := 0; v_h_l5 int := 0;
  v_reels int := 0;
  v_lives int := 0;
BEGIN
  SELECT country_code INTO v_country FROM public.country_super_admins
   WHERE user_id = auth.uid()
     AND is_active = true
     AND (expires_at IS NULL OR expires_at > now());
  IF v_country IS NULL THEN RAISE EXCEPTION 'Not a CSA'; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true AND COALESCE(is_blocked,false) = false)
    INTO v_agencies, v_active_agencies
  FROM public.agencies WHERE upper(COALESCE(country_code,'')) = v_country;

  SELECT COUNT(*) INTO v_hosts FROM public.profiles
   WHERE upper(COALESCE(country_code,'')) = v_country AND COALESCE(is_host,false) = true;

  SELECT COUNT(*) INTO v_users FROM public.profiles
   WHERE upper(COALESCE(country_code,'')) = v_country;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE level = 1),
         COUNT(*) FILTER (WHERE level = 2),
         COUNT(*) FILTER (WHERE level = 3),
         COUNT(*) FILTER (WHERE level = 4),
         COUNT(*) FILTER (WHERE level = 5)
    INTO v_helpers_total, v_h_l1, v_h_l2, v_h_l3, v_h_l4, v_h_l5
  FROM public.topup_helpers
  WHERE upper(COALESCE(country_code,'')) = v_country;

  SELECT COUNT(*) INTO v_reels FROM public.reels r
    JOIN public.profiles p ON p.id = r.user_id
   WHERE upper(COALESCE(p.country_code,'')) = v_country;

  SELECT COUNT(*) INTO v_lives FROM public.live_streams ls
    JOIN public.profiles p ON p.id = ls.host_id
   WHERE upper(COALESCE(p.country_code,'')) = v_country
     AND ls.status = 'live';

  RETURN jsonb_build_object(
    'country_code', v_country,
    'agencies_total', v_agencies,
    'agencies_active', v_active_agencies,
    'hosts_total', v_hosts,
    'users_total', v_users,
    'helpers_total', v_helpers_total,
    'helpers_l1', v_h_l1,
    'helpers_l2', v_h_l2,
    'helpers_l3', v_h_l3,
    'helpers_l4', v_h_l4,
    'helpers_l5', v_h_l5,
    'reels_total', v_reels,
    'lives_live_now', v_lives
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_set_agency_permanent(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_permanent_agencies() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_country_super_admin(uuid, uuid, text, text, numeric, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.csa_country_overview() TO authenticated;

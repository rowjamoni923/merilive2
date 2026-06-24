
-- 1. Official flag + closure metadata
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text;

-- 2. Pin the two Official agencies; force them open forever
UPDATE public.agencies
   SET is_official = true,
       activation_status = 'active',
       is_active = true,
       is_blocked = false,
       blocked_reason = NULL,
       blocked_at = NULL,
       closed_at = NULL,
       closed_reason = NULL,
       updated_at = now()
 WHERE id IN (
   'f3a69110-7894-46eb-a0fb-ff7d7d452ea6',
   'f6d74060-521b-4a66-8086-50d81043e127'
 );

-- 3. Auto-close: skip official, write closure metadata + notify owner
CREATE OR REPLACE FUNCTION public.auto_close_overdue_agencies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_reason text := 'Your agency was automatically closed because fewer than 10 hosts were activated within the 30-day activation window.';
BEGIN
  FOR r IN
    SELECT id, owner_id, name
      FROM public.agencies
     WHERE activation_status = 'pending'
       AND is_official = false
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

    IF r.owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        r.owner_id,
        'agency_closed',
        'Agency Closed',
        v_reason,
        jsonb_build_object('agency_id', r.id, 'agency_name', r.name, 'reason_code', 'host_activation_timeout')
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 4. Safety net: prevent latch/recalc from ever marking an official as closed
CREATE OR REPLACE FUNCTION public.recalc_agency_activation(p_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_status text;
  v_official boolean;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.agency_hosts
  WHERE agency_id = p_agency_id
    AND status = 'active'
    AND left_at IS NULL;

  SELECT activation_status, COALESCE(is_official, false)
    INTO v_status, v_official
  FROM public.agencies
  WHERE id = p_agency_id
  FOR UPDATE;

  IF v_status IS NULL THEN RETURN; END IF;

  IF v_official THEN
    UPDATE public.agencies
       SET active_host_count = v_count,
           activation_status = 'active',
           is_active = true,
           is_blocked = false,
           updated_at = now()
     WHERE id = p_agency_id;
    RETURN;
  END IF;

  IF v_status <> 'closed' AND v_count >= 10 THEN
    UPDATE public.agencies
       SET active_host_count = v_count,
           activation_status = 'active',
           updated_at = now()
     WHERE id = p_agency_id;
  ELSE
    UPDATE public.agencies
       SET active_host_count = v_count,
           updated_at = now()
     WHERE id = p_agency_id;
  END IF;
END;
$$;

-- 5. Admin RPC: list closed agencies with reasons, searchable by UID/name/code
CREATE OR REPLACE FUNCTION public.admin_search_closed_agencies(_search text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  agency_code text,
  owner_id uuid,
  owner_display_name text,
  owner_app_uid text,
  owner_avatar_url text,
  created_at timestamptz,
  closed_at timestamptz,
  closed_reason text,
  activation_deadline timestamptz,
  active_host_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  RETURN QUERY
  SELECT a.id, a.name, a.agency_code, a.owner_id,
         p.display_name, p.app_uid, p.avatar_url,
         a.created_at, a.closed_at,
         COALESCE(a.closed_reason, a.blocked_reason) AS closed_reason,
         a.activation_deadline, a.active_host_count
    FROM public.agencies a
    LEFT JOIN public.profiles p ON p.id = a.owner_id
   WHERE a.activation_status = 'closed'
     AND COALESCE(a.is_official, false) = false
     AND (
       _search IS NULL OR _search = '' OR
       a.name ILIKE '%' || _search || '%' OR
       a.agency_code ILIKE '%' || _search || '%' OR
       p.display_name ILIKE '%' || _search || '%' OR
       p.app_uid ILIKE '%' || _search || '%'
     )
   ORDER BY a.closed_at DESC NULLS LAST, a.updated_at DESC
   LIMIT 200;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_search_closed_agencies(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_closed_agencies(text) TO authenticated, service_role;

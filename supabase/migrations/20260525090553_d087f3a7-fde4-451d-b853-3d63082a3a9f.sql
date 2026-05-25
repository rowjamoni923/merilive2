-- Pkg329 final pass: remove conflicting legacy group triggers, fix member_count drift,
-- lock owner-leave, restore audience-scoped official notices, and harden notification RPC.

-- 1) Remove older duplicate/conflicting triggers that still fire alongside Pkg329 guards.
DROP TRIGGER IF EXISTS update_group_member_count_trigger ON public.group_members;
DROP TRIGGER IF EXISTS tg_guard_group_members_write ON public.group_members;
DROP TRIGGER IF EXISTS tg_guard_group_messages_write ON public.group_messages;
DROP TRIGGER IF EXISTS tg_guard_groups_write ON public.groups;

-- 2) Recalculate member_count once after removing the duplicate trigger.
UPDATE public.groups g
SET member_count = COALESCE(sub.c, 0)
FROM (
  SELECT g2.id AS group_id, count(gm.id)::int AS c
  FROM public.groups g2
  LEFT JOIN public.group_members gm ON gm.group_id = g2.id
  GROUP BY g2.id
) sub
WHERE g.id = sub.group_id;

-- 3) Prevent owner/member orphaning: group owner cannot leave/delete own owner row directly.
CREATE OR REPLACE FUNCTION public.tg_guard_group_members_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claim.role', true);
  v_group_owner uuid;
BEGIN
  IF v_role = 'service_role' OR public.is_active_admin_session() OR public.is_admin(auth.uid()) THEN
    RETURN OLD;
  END IF;

  SELECT owner_id INTO v_group_owner
  FROM public.groups
  WHERE id = OLD.group_id;

  IF OLD.role = 'owner' OR OLD.user_id IS NOT DISTINCT FROM v_group_owner THEN
    RAISE EXCEPTION 'owner_transfer_required';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_group_members_delete ON public.group_members;
CREATE TRIGGER guard_group_members_delete
BEFORE DELETE ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION public.tg_guard_group_members_delete();

-- 4) Official notices: restore full notice shape, audience filtering, and auth.uid() ownership check.
DROP FUNCTION IF EXISTS public.get_user_notices(uuid);

CREATE OR REPLACE FUNCTION public.get_user_notices(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  message text,
  target_audience text[],
  priority text,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  expires_at timestamptz,
  read_by uuid[],
  image_url text,
  is_read boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_is_host boolean := false;
  v_is_agency boolean := false;
  v_is_helper boolean := false;
  v_is_level5_helper boolean := false;
  v_audiences text[] := ARRAY['all', 'users'];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  IF v_role <> 'service_role'
     AND NOT public.is_active_admin_session()
     AND NOT public.is_admin(v_uid)
     AND v_uid IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COALESCE(p.is_host, false)
  INTO v_is_host
  FROM public.profiles p
  WHERE p.id = p_user_id OR p.user_id = p_user_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.agencies a
    WHERE a.owner_id = p_user_id AND COALESCE(a.is_active, true) = true
  ) INTO v_is_agency;

  SELECT EXISTS (
    SELECT 1 FROM public.topup_helpers th
    WHERE th.user_id = p_user_id AND COALESCE(th.is_verified, false) = true
  ) INTO v_is_helper;

  SELECT EXISTS (
    SELECT 1 FROM public.topup_helpers th
    WHERE th.user_id = p_user_id
      AND COALESCE(th.is_verified, false) = true
      AND COALESCE(th.trader_level, 0) = 5
  ) INTO v_is_level5_helper;

  IF v_is_host THEN v_audiences := array_append(v_audiences, 'hosts'); END IF;
  IF v_is_agency THEN v_audiences := array_append(v_audiences, 'agencies'); END IF;
  IF v_is_helper THEN v_audiences := array_append(v_audiences, 'helpers'); END IF;
  IF v_is_level5_helper THEN v_audiences := array_append(v_audiences, 'level5_helpers'); END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.title,
    n.message,
    n.target_audience,
    n.priority,
    COALESCE(n.is_active, true) AS is_active,
    n.created_by,
    n.created_at,
    n.expires_at,
    COALESCE(n.read_by, ARRAY[]::uuid[]) AS read_by,
    n.image_url,
    (p_user_id = ANY(COALESCE(n.read_by, ARRAY[]::uuid[]))) AS is_read
  FROM public.admin_notices n
  WHERE COALESCE(n.is_active, true) = true
    AND (n.expires_at IS NULL OR n.expires_at > now())
    AND COALESCE(n.target_audience, ARRAY['all']::text[]) && v_audiences
  ORDER BY
    CASE COALESCE(n.priority, 'normal')
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
      ELSE 5
    END,
    n.created_at DESC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_notices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_notices(uuid) TO authenticated, service_role;

-- 5) Harden legacy send_notification RPC: no anonymous/cross-user notification forging.
CREATE OR REPLACE FUNCTION public.send_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text DEFAULT NULL,
  p_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_type text := btrim(COALESCE(p_type, 'general'));
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_required';
  END IF;

  IF v_role <> 'service_role'
     AND NOT public.is_active_admin_session()
     AND NOT public.is_admin(v_uid) THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'auth_required';
    END IF;

    IF v_uid IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;

    IF v_type IN (
      'incoming_call','call_received','call_missed',
      'admin_message','admin_message_reply','admin_notice','admin_warning',
      'system','security','report_resolved',
      'topup_approved','topup_rejected','withdrawal_approved','withdrawal_rejected',
      'level_upgrade_approved','level_upgrade_rejected','helper_approved','helper_rejected',
      'payroll_approved','payroll_rejected','host_approved','host_rejected',
      'gift_received','gift','coins_added','coins_received','coin_purchase_helper',
      'coin_purchase_direct','diamonds_credited','payment_completed','beans_exchanged',
      'agency_approved','agency_verification','agency_withdrawal_approved','agency_diamond_received',
      'app_sync'
    ) OR v_type LIKE 'pk\_%' ESCAPE '\' THEN
      RAISE EXCEPTION 'restricted_notification_type';
    END IF;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(v_type, ''), 'general'),
    left(COALESCE(p_title, ''), 200),
    left(COALESCE(p_message, ''), 2000),
    COALESCE(p_data, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_notification(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, jsonb) TO authenticated, service_role;

-- 6) Tighten group avatar storage policies: path owner + real image MIME + no SVG.
DROP POLICY IF EXISTS group_avatars_owner_insert ON storage.objects;
DROP POLICY IF EXISTS group_avatars_owner_update ON storage.objects;
DROP POLICY IF EXISTS group_avatars_owner_delete ON storage.objects;

CREATE POLICY group_avatars_owner_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = 'group-avatars'
  AND lower(coalesce(split_part(split_part(name,'/',2),'.',2),'')) <> 'svg'
  AND lower(coalesce(metadata->>'mimetype', '')) IN ('image/jpeg','image/jpg','image/png','image/webp','image/gif')
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id::text = split_part(split_part(name,'/',2),'.',1)
      AND g.owner_id = auth.uid()
  )
);

CREATE POLICY group_avatars_owner_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = 'group-avatars'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id::text = split_part(split_part(name,'/',2),'.',1)
      AND g.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = 'group-avatars'
  AND lower(coalesce(split_part(split_part(name,'/',2),'.',2),'')) <> 'svg'
  AND lower(coalesce(metadata->>'mimetype', '')) IN ('image/jpeg','image/jpg','image/png','image/webp','image/gif')
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id::text = split_part(split_part(name,'/',2),'.',1)
      AND g.owner_id = auth.uid()
  )
);

CREATE POLICY group_avatars_owner_delete ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'assets'
  AND (storage.foldername(name))[1] = 'group-avatars'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id::text = split_part(split_part(name,'/',2),'.',1)
      AND g.owner_id = auth.uid()
  )
);
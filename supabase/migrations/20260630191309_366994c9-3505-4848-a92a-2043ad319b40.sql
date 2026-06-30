CREATE OR REPLACE FUNCTION public.notice_target_audiences_for_user(p_user_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_host boolean := false;
  v_is_agency boolean := false;
  v_is_helper boolean := false;
  v_is_level5_helper boolean := false;
  v_is_deleted boolean := false;
  v_audiences text[] := ARRAY['all']::text[];
BEGIN
  IF p_user_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT
    COALESCE(p.is_host, false),
    COALESCE(p.is_deleted, false)
  INTO v_is_host, v_is_deleted
  FROM public.profiles p
  WHERE p.id = p_user_id
  LIMIT 1;

  IF NOT FOUND OR v_is_deleted THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.agencies a
    WHERE a.owner_id = p_user_id
      AND COALESCE(a.is_active, true) = true
  ) INTO v_is_agency;

  SELECT EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.user_id = p_user_id
      AND COALESCE(th.is_verified, false) = true
  ) INTO v_is_helper;

  SELECT EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.user_id = p_user_id
      AND COALESCE(th.is_verified, false) = true
      AND COALESCE(th.trader_level, 0) = 5
  ) INTO v_is_level5_helper;

  IF v_is_host THEN
    v_audiences := array_append(v_audiences, 'hosts');
  END IF;

  IF v_is_agency THEN
    v_audiences := array_append(v_audiences, 'agencies');
  END IF;

  IF v_is_helper THEN
    v_audiences := array_append(v_audiences, 'helpers');
  END IF;

  IF v_is_level5_helper THEN
    v_audiences := array_append(v_audiences, 'level5_helpers');
  END IF;

  IF NOT v_is_host AND NOT v_is_agency AND NOT v_is_helper THEN
    v_audiences := array_append(v_audiences, 'users');
  END IF;

  RETURN v_audiences;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notice_target_audiences_for_user(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.notice_target_audiences_for_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_notices(p_user_id uuid)
RETURNS TABLE(
  id uuid,
  title text,
  message text,
  target_audience text[],
  priority text,
  is_active boolean,
  created_by uuid,
  created_at timestamp with time zone,
  expires_at timestamp with time zone,
  read_by uuid[],
  image_url text,
  is_read boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text := current_setting('request.jwt.claim.role', true);
  v_audiences text[];
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

  v_audiences := public.notice_target_audiences_for_user(p_user_id);

  IF COALESCE(array_length(v_audiences, 1), 0) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.title,
    n.message,
    COALESCE(n.target_audience, ARRAY['all']::text[]) AS target_audience,
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

REVOKE EXECUTE ON FUNCTION public.get_user_notices(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_notices(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.broadcast_notice_to_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_broadcast_notice ON public.admin_notices;
CREATE TRIGGER trigger_broadcast_notice
AFTER INSERT ON public.admin_notices
FOR EACH ROW
EXECUTE FUNCTION public.broadcast_notice_to_users();

INSERT INTO public.admin_broadcast (topic, version, last_event, last_row_id, updated_at)
VALUES ('admin_notices', 0, 'INIT', NULL, now())
ON CONFLICT (topic) DO NOTHING;

DROP TRIGGER IF EXISTS tg_admin_broadcast_admin_notices ON public.admin_notices;
CREATE TRIGGER tg_admin_broadcast_admin_notices
AFTER INSERT OR UPDATE OR DELETE ON public.admin_notices
FOR EACH ROW
EXECUTE FUNCTION public.tg_admin_broadcast_bump('admin_notices');

CREATE INDEX IF NOT EXISTS idx_profiles_notice_targeting
  ON public.profiles (id, is_host, is_deleted);

CREATE INDEX IF NOT EXISTS idx_agencies_notice_owner_active
  ON public.agencies (owner_id, is_active);

CREATE INDEX IF NOT EXISTS idx_topup_helpers_notice_user_level
  ON public.topup_helpers (user_id, is_verified, trader_level);
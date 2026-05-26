-- Fix 1: get_user_notices referenced non-existent profiles.user_id column
CREATE OR REPLACE FUNCTION public.get_user_notices(p_user_id uuid)
 RETURNS TABLE(id uuid, title text, message text, target_audience text[], priority text, is_active boolean, created_by uuid, created_at timestamp with time zone, expires_at timestamp with time zone, read_by uuid[], image_url text, is_read boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE p.id = p_user_id
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
    n.id, n.title, n.message, n.target_audience, n.priority,
    COALESCE(n.is_active, true) AS is_active,
    n.created_by, n.created_at, n.expires_at,
    COALESCE(n.read_by, ARRAY[]::uuid[]) AS read_by,
    n.image_url,
    (p_user_id = ANY(COALESCE(n.read_by, ARRAY[]::uuid[]))) AS is_read
  FROM public.admin_notices n
  WHERE COALESCE(n.is_active, true) = true
    AND (n.expires_at IS NULL OR n.expires_at > now())
    AND COALESCE(n.target_audience, ARRAY['all']::text[]) && v_audiences
  ORDER BY
    CASE COALESCE(n.priority, 'normal')
      WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5
    END,
    n.created_at DESC
  LIMIT 50;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_user_notices(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_notices(uuid) TO authenticated, service_role;

-- Fix 2: account_lockouts ON CONFLICT (identifier) needs a unique index
DELETE FROM public.account_lockouts a USING public.account_lockouts b
  WHERE a.ctid < b.ctid AND a.identifier = b.identifier;
CREATE UNIQUE INDEX IF NOT EXISTS account_lockouts_identifier_uidx
  ON public.account_lockouts(identifier);

-- Fix 3: distribute_period_rewards references leaderboard_reward_config.min_target which doesn't exist
ALTER TABLE public.leaderboard_reward_config
  ADD COLUMN IF NOT EXISTS min_target bigint;
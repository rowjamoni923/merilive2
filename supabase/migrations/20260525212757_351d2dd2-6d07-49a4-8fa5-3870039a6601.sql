CREATE OR REPLACE FUNCTION public.is_user_live_banned(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.live_bans lb
    WHERE lb.user_id = p_user_id
      AND COALESCE(lb.is_active, true) = true
      AND (
        COALESCE(lb.expires_at, lb.ban_end) IS NULL
        OR COALESCE(lb.expires_at, lb.ban_end) > now()
      )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_live_ban(p_user_id uuid)
RETURNS TABLE(ban_id uuid, ban_reason text, ban_start timestamp with time zone, ban_end timestamp with time zone, banned_by uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF v_uid <> p_user_id AND NOT public.is_active_admin_session() AND current_setting('request.jwt.claim.role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized to view this live ban' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lb.id,
    COALESCE(lb.reason, lb.ban_reason, lb.violation_type, 'Policy violation') AS ban_reason,
    COALESCE(lb.created_at, lb.ban_start) AS ban_start,
    COALESCE(lb.expires_at, lb.ban_end) AS ban_end,
    lb.banned_by
  FROM public.live_bans lb
  WHERE lb.user_id = p_user_id
    AND COALESCE(lb.is_active, true) = true
    AND (
      COALESCE(lb.expires_at, lb.ban_end) IS NULL
      OR COALESCE(lb.expires_at, lb.ban_end) > now()
    )
  ORDER BY COALESCE(lb.created_at, lb.ban_start, now()) DESC
  LIMIT 1;
END;
$function$;
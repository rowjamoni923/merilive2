-- Fix admin moderation RPCs that failed from the custom admin session client.
-- Root causes:
-- 1) profiles.app_uid is varchar while some RETURNS TABLE signatures declare text.
-- 2) legacy RPCs relied on auth.uid()/auth users, but the admin panel uses x-admin-token custom sessions.

CREATE OR REPLACE FUNCTION public.admin_list_live_bans(_only_active boolean DEFAULT true, _limit integer DEFAULT 200)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  ban_reason text,
  violation_type text,
  warning_count integer,
  ban_start timestamp with time zone,
  ban_end timestamp with time zone,
  ban_duration_hours integer,
  is_active boolean,
  auto_banned boolean,
  unbanned_by uuid,
  unbanned_at timestamp with time zone,
  display_name text,
  avatar_url text,
  app_uid text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_active_admin_session()) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT
    lb.id,
    lb.user_id,
    lb.ban_reason,
    lb.violation_type,
    lb.warning_count,
    lb.ban_start,
    lb.ban_end,
    lb.ban_duration_hours,
    lb.is_active,
    lb.auto_banned,
    lb.unbanned_by,
    lb.unbanned_at,
    p.display_name::text,
    p.avatar_url::text,
    p.app_uid::text
  FROM public.live_bans lb
  LEFT JOIN public.profiles p ON p.id = lb.user_id
  WHERE (NOT _only_active OR lb.is_active = true)
  ORDER BY lb.ban_start DESC NULLS LAST
  LIMIT GREATEST(_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_face_violations(_admin_id uuid, _limit integer DEFAULT 200)
RETURNS TABLE(
  id uuid,
  host_id uuid,
  stream_id uuid,
  violation_type text,
  frame_url text,
  confidence numeric,
  action_taken text,
  status text,
  created_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  display_name text,
  app_uid text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    v.id,
    v.host_id,
    v.stream_id,
    v.violation_type,
    v.frame_url,
    v.confidence,
    v.action_taken,
    v.status,
    v.created_at,
    v.reviewed_at,
    p.display_name::text,
    p.app_uid::text
  FROM public.live_face_violations v
  LEFT JOIN public.profiles p ON p.id = v.host_id
  WHERE (
    public.is_active_admin_session()
    OR public.is_admin_session(_admin_id)
    OR public.is_admin(auth.uid())
  )
  ORDER BY v.created_at DESC
  LIMIT GREATEST(_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.admin_list_severity_bans(_severity text DEFAULT NULL::text, _limit integer DEFAULT 200)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  display_name text,
  app_uid text,
  avatar_url text,
  ban_reason text,
  severity text,
  ban_start timestamp with time zone,
  ban_end timestamp with time zone,
  is_active boolean,
  device_banned boolean,
  ip_banned boolean,
  face_hash_banned boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    lb.id,
    lb.user_id,
    p.display_name::text,
    p.app_uid::text,
    p.avatar_url::text,
    lb.ban_reason,
    COALESCE(lb.severity, 'high')::text AS severity,
    lb.ban_start,
    lb.ban_end,
    lb.is_active,
    COALESCE(lb.device_banned, false),
    COALESCE(lb.ip_banned, false),
    COALESCE(lb.face_hash_banned, false)
  FROM public.live_bans lb
  LEFT JOIN public.profiles p ON p.id = lb.user_id
  WHERE (
    public.is_active_admin_session()
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
    OR public.is_admin(auth.uid())
  )
    AND (_severity IS NULL OR lb.severity = _severity)
  ORDER BY lb.ban_start DESC NULLS LAST
  LIMIT GREATEST(_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.admin_update_face_violation(_admin_id uuid, _violation_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := COALESCE(public.current_admin_id_from_header(), _admin_id, auth.uid());

  IF NOT (
    public.is_active_admin_session()
    OR public.is_admin_session(_admin_id)
    OR public.is_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.live_face_violations
  SET status = _status,
      action_taken = _status,
      reviewed_at = now(),
      reviewed_by = v_admin_id
  WHERE id = _violation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_session_unban_live(_admin_id uuid, _ban_id uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := COALESCE(public.current_admin_id_from_header(), _admin_id, auth.uid());

  IF NOT (
    public.is_active_admin_session()
    OR public.is_admin_session(_admin_id)
    OR public.is_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.live_bans
  SET is_active = false,
      unbanned_by = v_admin_id,
      unbanned_at = now(),
      ban_end = COALESCE(ban_end, now()),
      unban_reason = COALESCE(_reason, 'Unbanned by admin')
  WHERE id = _ban_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_session_block_user(_admin_id uuid, _user_id uuid, _block boolean, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    public.is_active_admin_session()
    OR public.is_admin_session(_admin_id)
    OR public.is_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _block THEN
    UPDATE public.profiles
    SET is_blocked = true,
        blocked_at = now(),
        blocked_reason = _reason
    WHERE id = _user_id;
  ELSE
    UPDATE public.profiles
    SET is_blocked = false,
        blocked_at = NULL,
        blocked_reason = NULL
    WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_severity_ban(
  _target_user_id uuid,
  _severity text,
  _duration_value integer,
  _reason text,
  _evidence jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_device_id text;
  v_ip text;
  v_face_hash text;
  v_ban_end timestamptz;
  v_duration_hours integer;
  v_devices_banned int := 0;
  v_ips_banned int := 0;
  v_faces_banned int := 0;
BEGIN
  v_admin_id := COALESCE(public.current_admin_id_from_header(), auth.uid());

  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only active admins can apply bans';
  END IF;

  IF _severity NOT IN ('medium', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Invalid severity. Must be medium, high, or urgent.';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Reason is required';
  END IF;

  IF _severity = 'urgent' THEN
    v_ban_end := NULL;
    v_duration_hours := NULL;
  ELSIF _severity = 'high' THEN
    IF _duration_value IS NULL OR _duration_value < 1 THEN
      RAISE EXCEPTION 'High severity requires a positive duration (hours)';
    END IF;
    v_duration_hours := _duration_value;
    v_ban_end := now() + make_interval(hours => _duration_value);
  ELSE
    IF _duration_value IS NULL OR _duration_value < 1 THEN
      RAISE EXCEPTION 'Medium severity requires a positive duration (days)';
    END IF;
    v_duration_hours := _duration_value * 24;
    v_ban_end := now() + make_interval(days => _duration_value);
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  SELECT device_id, last_ip, face_hash
  INTO v_device_id, v_ip, v_face_hash
  FROM public.profiles
  WHERE id = _target_user_id;

  UPDATE public.profiles
  SET is_blocked = true,
      blocked_reason = _reason,
      blocked_at = now()
  WHERE id = _target_user_id;

  INSERT INTO public.live_bans (
    user_id, ban_reason, reason, violation_type, ban_type,
    ban_duration_hours, ban_start, ban_end, expires_at,
    is_active, auto_banned, severity,
    device_banned, ip_banned, face_hash_banned
  ) VALUES (
    _target_user_id, _reason, _reason, 'manual_admin',
    CASE WHEN _severity = 'urgent' THEN 'permanent' ELSE 'temporary' END,
    v_duration_hours, now(), v_ban_end, v_ban_end,
    true, false, _severity,
    (_severity = 'urgent' AND v_device_id IS NOT NULL),
    (_severity = 'urgent' AND v_ip IS NOT NULL),
    (_severity = 'urgent' AND v_face_hash IS NOT NULL)
  );

  IF _severity = 'urgent' THEN
    IF v_device_id IS NOT NULL THEN
      INSERT INTO public.banned_devices (device_id, user_id, reason, banned_by, is_active, is_permanent, banned_at)
      VALUES (v_device_id, _target_user_id, 'URGENT BAN: ' || _reason, v_admin_id, true, true, now())
      ON CONFLICT (device_id) DO UPDATE
        SET is_active = true, is_permanent = true, reason = 'URGENT BAN: ' || _reason, updated_at = now();
      v_devices_banned := 1;
    END IF;

    IF v_ip IS NOT NULL AND length(trim(v_ip)) > 0 THEN
      INSERT INTO public.banned_ips (ip_address, user_id, reason, banned_by, is_active)
      VALUES (v_ip, _target_user_id, 'URGENT BAN: ' || _reason, v_admin_id, true)
      ON CONFLICT DO NOTHING;
      v_ips_banned := 1;
    END IF;

    IF v_face_hash IS NOT NULL AND length(trim(v_face_hash)) > 0 THEN
      INSERT INTO public.banned_face_hashes (face_hash, user_id, reason, banned_by, is_active)
      VALUES (v_face_hash, _target_user_id, 'URGENT BAN: ' || _reason, v_admin_id, true)
      ON CONFLICT (face_hash) DO UPDATE
        SET is_active = true, reason = 'URGENT BAN: ' || _reason, updated_at = now();
      v_faces_banned := 1;
    END IF;
  END IF;

  INSERT INTO public.admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() ELSE NULL END,
    'severity_ban_' || _severity,
    _target_user_id,
    'user',
    jsonb_build_object(
      'admin_user_id', v_admin_id,
      'severity', _severity,
      'duration_value', _duration_value,
      'reason', _reason,
      'evidence', _evidence,
      'ban_end', v_ban_end,
      'devices_banned', v_devices_banned,
      'ips_banned', v_ips_banned,
      'faces_banned', v_faces_banned
    )
  );

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'severity', _severity,
    'ban_end', v_ban_end,
    'devices_banned', v_devices_banned,
    'ips_banned', v_ips_banned,
    'faces_banned', v_faces_banned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_live_bans(boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_face_violations(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_severity_bans(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_face_violation(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_session_unban_live(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_session_block_user(uuid, uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_apply_severity_ban(uuid, text, integer, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_list_live_bans(boolean, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_face_violations(uuid, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_severity_bans(text, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_face_violation(uuid, uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_session_unban_live(uuid, uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_session_block_user(uuid, uuid, boolean, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_severity_ban(uuid, text, integer, text, jsonb) TO authenticated, anon;
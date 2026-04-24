-- Banned face hashes table
CREATE TABLE IF NOT EXISTS public.banned_face_hashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  face_hash text NOT NULL UNIQUE,
  user_id uuid,
  banned_by uuid,
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  banned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.banned_face_hashes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins can manage banned face hashes" ON public.banned_face_hashes;
CREATE POLICY "Only admins can manage banned face hashes"
ON public.banned_face_hashes
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true));

CREATE INDEX IF NOT EXISTS idx_banned_face_hashes_active ON public.banned_face_hashes(face_hash) WHERE is_active = true;

-- Add severity tracking to live_bans
ALTER TABLE public.live_bans
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS device_banned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ip_banned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS face_hash_banned boolean DEFAULT false;

-- Master severity-based ban RPC
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
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_is_admin boolean;
  v_device_id text;
  v_ip text;
  v_face_hash text;
  v_ban_end timestamptz;
  v_duration_hours integer;
  v_devices_banned int := 0;
  v_ips_banned int := 0;
  v_faces_banned int := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = v_admin_id AND is_active = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
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
    v_admin_id,
    'severity_ban_' || _severity,
    _target_user_id,
    'user',
    jsonb_build_object(
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

GRANT EXECUTE ON FUNCTION public.admin_apply_severity_ban(uuid, text, integer, text, jsonb) TO authenticated;

-- Pre-signup gate
CREATE OR REPLACE FUNCTION public.check_signup_eligibility(
  _device_id text DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _face_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked_reason text;
BEGIN
  IF _device_id IS NOT NULL AND _device_id <> '' THEN
    SELECT reason INTO v_blocked_reason
    FROM public.banned_devices
    WHERE device_id = _device_id AND is_active = true AND is_permanent = true
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'device_banned', 'detail', v_blocked_reason);
    END IF;
  END IF;

  IF _ip_address IS NOT NULL AND _ip_address <> '' THEN
    SELECT reason INTO v_blocked_reason
    FROM public.banned_ips
    WHERE ip_address = _ip_address AND is_active = true
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'ip_banned', 'detail', v_blocked_reason);
    END IF;
  END IF;

  IF _face_hash IS NOT NULL AND _face_hash <> '' THEN
    SELECT reason INTO v_blocked_reason
    FROM public.banned_face_hashes
    WHERE face_hash = _face_hash AND is_active = true
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'face_banned', 'detail', v_blocked_reason);
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_signup_eligibility(text, text, text) TO anon, authenticated;

-- List severity bans for UI
CREATE OR REPLACE FUNCTION public.admin_list_severity_bans(
  _severity text DEFAULT NULL,
  _limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  display_name text,
  app_uid text,
  avatar_url text,
  ban_reason text,
  severity text,
  ban_start timestamptz,
  ban_end timestamptz,
  is_active boolean,
  device_banned boolean,
  ip_banned boolean,
  face_hash_banned boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    lb.id, lb.user_id,
    p.display_name, p.app_uid, p.avatar_url,
    lb.ban_reason, COALESCE(lb.severity, 'high') AS severity,
    lb.ban_start, lb.ban_end, lb.is_active,
    COALESCE(lb.device_banned, false), COALESCE(lb.ip_banned, false), COALESCE(lb.face_hash_banned, false)
  FROM public.live_bans lb
  LEFT JOIN public.profiles p ON p.id = lb.user_id
  WHERE EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
    AND (_severity IS NULL OR lb.severity = _severity)
  ORDER BY lb.ban_start DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_severity_bans(text, integer) TO authenticated;

-- Register sidebar sections (delete-then-insert to avoid ON CONFLICT issue)
DELETE FROM public.admin_sections WHERE section_key IN ('country-distribution', 'permanent-ban');
INSERT INTO public.admin_sections (section_key, section_name, section_name_bn, hub_key, icon_name, display_order, is_active)
VALUES
  ('country-distribution', 'Country Distribution', 'দেশভিত্তিক বন্টন', 'user-hub', 'Globe', 11, true),
  ('permanent-ban', 'Permanent Ban', 'স্থায়ী নিষেধাজ্ঞা', 'user-hub', 'Skull', 10, true);

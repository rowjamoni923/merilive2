
-- Update ban_duplicate_face_attempt to also create an admin_notices entry
CREATE OR REPLACE FUNCTION public.ban_duplicate_face_attempt(
  _user_id uuid,
  _duplicate_user_id uuid,
  _duplicate_uid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text;
  v_reason text;
  v_user_name text;
  v_user_uid text;
  v_dup_name text;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Unauthorized duplicate-face ban attempt';
  END IF;

  v_reason := format(
    'Permanent ban: duplicate face detected. Matched existing account %s',
    COALESCE(_duplicate_uid, _duplicate_user_id::text)
  );

  -- Get user details for admin notice
  SELECT display_name, app_uid, device_id INTO v_user_name, v_user_uid, v_device_id
  FROM public.profiles WHERE id = _user_id;

  SELECT display_name INTO v_dup_name
  FROM public.profiles WHERE id = _duplicate_user_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_blocked = true,
      blocked_reason = v_reason,
      blocked_at = now()
  WHERE id = _user_id
    AND is_blocked IS NOT TRUE;

  INSERT INTO public.live_bans (user_id, ban_reason, violation_type, ban_duration_hours, ban_end, is_active, auto_banned)
  SELECT _user_id, v_reason, 'duplicate_face', NULL, NULL, true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.live_bans
    WHERE user_id = _user_id AND is_active = true AND ban_end IS NULL AND ban_duration_hours IS NULL
  );

  IF v_device_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.banned_devices WHERE device_id = v_device_id AND is_permanent = true
  ) THEN
    INSERT INTO public.banned_devices (user_id, device_id, reason, is_permanent, banned_at)
    VALUES (_user_id, v_device_id, v_reason, true, now());
  END IF;

  -- Create admin notice for duplicate face detection
  INSERT INTO public.admin_notices (
    title, message, priority, target_audience, is_active
  ) VALUES (
    '🚨 Duplicate Face Detected & Banned',
    format(
      'User: %s (UID: %s)%sMatched Account: %s (UID: %s)%sDevice ID: %s%sAction: Auto-banned permanently',
      COALESCE(v_user_name, 'Unknown'), COALESCE(v_user_uid, _user_id::text),
      E'\n',
      COALESCE(v_dup_name, 'Unknown'), COALESCE(_duplicate_uid, _duplicate_user_id::text),
      E'\n',
      COALESCE(v_device_id, 'N/A'),
      E'\n'
    ),
    'urgent',
    ARRAY['owner', 'admin'],
    true
  );

  RETURN jsonb_build_object('success', true, 'reason', v_reason);
END;
$$;

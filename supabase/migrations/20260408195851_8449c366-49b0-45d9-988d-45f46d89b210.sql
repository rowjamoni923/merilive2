DROP FUNCTION IF EXISTS public.validate_session_integrity(uuid,text,text,text);

CREATE OR REPLACE FUNCTION public.validate_session_integrity(
  p_user_id uuid,
  p_device_fingerprint text,
  p_ip_address text,
  p_user_agent text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_profile RECORD;
  v_known_device BOOLEAN := false;
BEGIN
  SELECT id, device_id, COALESCE(is_banned, is_blocked) as is_banned
  INTO v_profile
  FROM profiles
  WHERE id = p_user_id;

  IF v_profile IS NULL THEN
    RETURN json_build_object('valid', true, 'action', 'allow', 'reason', 'new_user');
  END IF;

  IF v_profile.is_banned = true THEN
    RETURN json_build_object('valid', false, 'action', 'force_logout', 'reason', 'user_banned');
  END IF;

  IF v_profile.device_id IS NOT NULL AND v_profile.device_id = p_device_fingerprint THEN
    v_known_device := true;
  END IF;

  UPDATE profiles SET last_seen_at = now() WHERE id = p_user_id;

  RETURN json_build_object('valid', true, 'action', 'allow', 'known_device', v_known_device, 'reason', 'session_valid');
END;
$$;
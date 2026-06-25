
-- 1. Default admin setting for the 10-strike threshold (idempotent).
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES ('contact_violation_ban_threshold', '10'::jsonb, 'Number of phone/social contact-share strikes before an account is permanently barred from re-verifying identity (face hash + device + signup IP blocklisted).')
ON CONFLICT (setting_key) DO NOTHING;

-- 2. Helper to read the threshold (admin-panel single source of truth).
CREATE OR REPLACE FUNCTION public.get_contact_violation_ban_threshold()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(1, COALESCE(
    NULLIF(regexp_replace((setting_value)::text, '[^0-9]', '', 'g'), '')::int,
    10
  ))
  FROM public.app_settings
  WHERE setting_key = 'contact_violation_ban_threshold'
  LIMIT 1;
$$;

-- 3. Trigger function: when a contact violation pushes the user's total
--    strikes >= threshold, propagate the ban to banned_face_hashes /
--    banned_devices / banned_ips so the same person cannot re-register.
CREATE OR REPLACE FUNCTION public.propagate_contact_violation_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold int;
  v_total int;
  v_face_hash text;
  v_device_id text;
  v_signup_ip text;
  v_last_ip text;
BEGIN
  v_threshold := public.get_contact_violation_ban_threshold();

  SELECT
    COALESCE((SELECT COUNT(*) FROM public.user_contact_violations WHERE user_id = NEW.user_id), 0)
    + COALESCE((SELECT COUNT(*) FROM public.host_contact_violations WHERE user_id = NEW.user_id), 0)
  INTO v_total;

  IF v_total < v_threshold THEN
    RETURN NEW;
  END IF;

  -- Pull identity signals from profile (best-effort).
  SELECT face_hash, device_id, signup_ip, last_login_ip
  INTO v_face_hash, v_device_id, v_signup_ip, v_last_ip
  FROM public.profiles WHERE id = NEW.user_id;

  -- Mark the profile itself.
  UPDATE public.profiles
  SET is_banned = TRUE
  WHERE id = NEW.user_id AND COALESCE(is_banned, FALSE) = FALSE;

  -- Blocklist the face (so a new signup with same selfie is auto-rejected).
  IF v_face_hash IS NOT NULL AND length(v_face_hash) > 0 THEN
    INSERT INTO public.banned_face_hashes (face_hash, user_id, reason)
    VALUES (v_face_hash, NEW.user_id, 'contact_violation_threshold')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Blocklist the device.
  IF v_device_id IS NOT NULL AND length(v_device_id) > 0 THEN
    INSERT INTO public.banned_devices (device_id, user_id, reason)
    VALUES (v_device_id, NEW.user_id, 'contact_violation_threshold')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Blocklist signup + last-login IPs.
  IF v_signup_ip IS NOT NULL AND length(v_signup_ip) > 0 THEN
    INSERT INTO public.banned_ips (ip_address, user_id, reason)
    VALUES (v_signup_ip, NEW.user_id, 'contact_violation_threshold')
    ON CONFLICT DO NOTHING;
  END IF;
  IF v_last_ip IS NOT NULL AND length(v_last_ip) > 0 AND v_last_ip <> COALESCE(v_signup_ip, '') THEN
    INSERT INTO public.banned_ips (ip_address, user_id, reason)
    VALUES (v_last_ip, NEW.user_id, 'contact_violation_threshold')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_contact_violation_propagate_ban ON public.user_contact_violations;
CREATE TRIGGER trg_user_contact_violation_propagate_ban
  AFTER INSERT ON public.user_contact_violations
  FOR EACH ROW EXECUTE FUNCTION public.propagate_contact_violation_ban();

DROP TRIGGER IF EXISTS trg_host_contact_violation_propagate_ban ON public.host_contact_violations;
CREATE TRIGGER trg_host_contact_violation_propagate_ban
  AFTER INSERT ON public.host_contact_violations
  FOR EACH ROW EXECUTE FUNCTION public.propagate_contact_violation_ban();

-- 4. Eligibility RPC the app calls at FaceVerification mount.
CREATE OR REPLACE FUNCTION public.check_face_verification_eligibility()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_face_hash text;
  v_device_id text;
  v_signup_ip text;
  v_last_ip text;
  v_is_banned boolean;
  v_violation_total int;
  v_threshold int;
  v_face_hash_match int := 0;
  v_device_match int := 0;
  v_ip_match int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'not_authenticated');
  END IF;

  SELECT face_hash, device_id, signup_ip, last_login_ip, COALESCE(is_banned, FALSE)
  INTO v_face_hash, v_device_id, v_signup_ip, v_last_ip, v_is_banned
  FROM public.profiles WHERE id = v_uid;

  IF v_is_banned THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'account_banned');
  END IF;

  v_threshold := public.get_contact_violation_ban_threshold();
  SELECT COALESCE((SELECT COUNT(*) FROM public.user_contact_violations WHERE user_id = v_uid), 0)
       + COALESCE((SELECT COUNT(*) FROM public.host_contact_violations WHERE user_id = v_uid), 0)
  INTO v_violation_total;

  IF v_violation_total >= v_threshold THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'contact_violation_threshold',
      'violation_count', v_violation_total, 'threshold', v_threshold);
  END IF;

  -- Cross-identity reuse: face/device/ip listed in global ban tables (possibly under a different user_id).
  IF v_face_hash IS NOT NULL AND length(v_face_hash) > 0 THEN
    SELECT COUNT(*) INTO v_face_hash_match FROM public.banned_face_hashes WHERE face_hash = v_face_hash;
  END IF;
  IF v_device_id IS NOT NULL AND length(v_device_id) > 0 THEN
    SELECT COUNT(*) INTO v_device_match FROM public.banned_devices WHERE device_id = v_device_id;
  END IF;
  IF v_signup_ip IS NOT NULL AND length(v_signup_ip) > 0 THEN
    SELECT COUNT(*) INTO v_ip_match FROM public.banned_ips WHERE ip_address = v_signup_ip;
  END IF;

  IF (v_face_hash_match + v_device_match + v_ip_match) > 0 THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'banned_identity_reuse',
      'face_match', v_face_hash_match, 'device_match', v_device_match, 'ip_match', v_ip_match);
  END IF;

  RETURN jsonb_build_object('eligible', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_violation_ban_threshold() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_face_verification_eligibility() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.propagate_contact_violation_ban() TO service_role;

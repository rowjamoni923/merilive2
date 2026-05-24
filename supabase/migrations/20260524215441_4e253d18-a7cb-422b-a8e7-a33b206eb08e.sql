CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bypass_protection boolean := COALESCE(current_setting('app.bypass_profile_protection', true), 'false') = 'true';
  _is_privileged boolean := false;
BEGIN
  IF _bypass_protection THEN
    RETURN NEW;
  END IF;

  _is_privileged := current_setting('request.jwt.claim.role', true) = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.is_admin(auth.uid()))
    OR public.is_active_admin_session();

  IF _is_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Money / earnings / levels / subscriptions
    IF NEW.coins IS DISTINCT FROM OLD.coins THEN RAISE EXCEPTION 'Direct modification of coins is not allowed'; END IF;
    IF NEW.beans IS DISTINCT FROM OLD.beans THEN RAISE EXCEPTION 'Direct modification of beans is not allowed'; END IF;
    IF NEW.diamonds IS DISTINCT FROM OLD.diamonds THEN RAISE EXCEPTION 'Direct modification of diamonds is not allowed'; END IF;
    IF NEW.beans_balance IS DISTINCT FROM OLD.beans_balance THEN RAISE EXCEPTION 'Direct modification of beans_balance is not allowed'; END IF;
    IF NEW.total_earnings IS DISTINCT FROM OLD.total_earnings THEN RAISE EXCEPTION 'Direct modification of total_earnings is not allowed'; END IF;
    IF NEW.pending_earnings IS DISTINCT FROM OLD.pending_earnings THEN RAISE EXCEPTION 'Direct modification of pending_earnings is not allowed'; END IF;
    IF NEW.weekly_earnings IS DISTINCT FROM OLD.weekly_earnings THEN RAISE EXCEPTION 'Direct modification of weekly_earnings is not allowed'; END IF;
    IF NEW.total_consumption IS DISTINCT FROM OLD.total_consumption THEN RAISE EXCEPTION 'Direct modification of total_consumption is not allowed'; END IF;
    IF NEW.total_recharged IS DISTINCT FROM OLD.total_recharged THEN RAISE EXCEPTION 'Direct modification of total_recharged is not allowed'; END IF;
    IF NEW.user_level IS DISTINCT FROM OLD.user_level THEN RAISE EXCEPTION 'Direct modification of user_level is not allowed'; END IF;
    IF NEW.max_user_level IS DISTINCT FROM OLD.max_user_level THEN RAISE EXCEPTION 'Direct modification of max_user_level is not allowed'; END IF;
    IF NEW.host_level IS DISTINCT FROM OLD.host_level THEN RAISE EXCEPTION 'Direct modification of host_level is not allowed'; END IF;
    IF NEW.previous_host_level IS DISTINCT FROM OLD.previous_host_level THEN RAISE EXCEPTION 'Direct modification of previous_host_level is not allowed'; END IF;
    IF NEW.current_vip_tier_id IS DISTINCT FROM OLD.current_vip_tier_id THEN RAISE EXCEPTION 'Direct modification of current_vip_tier_id is not allowed'; END IF;
    IF NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at THEN RAISE EXCEPTION 'Direct modification of vip_expires_at is not allowed'; END IF;
    IF NEW.vip_tier IS DISTINCT FROM OLD.vip_tier THEN RAISE EXCEPTION 'Direct modification of vip_tier is not allowed'; END IF;

    -- Host / verification / moderation state
    IF NEW.is_host IS DISTINCT FROM OLD.is_host THEN RAISE EXCEPTION 'Direct modification of is_host is not allowed'; END IF;
    IF NEW.host_status IS DISTINCT FROM OLD.host_status THEN RAISE EXCEPTION 'Direct modification of host_status is not allowed'; END IF;
    IF NEW.host_verified_at IS DISTINCT FROM OLD.host_verified_at THEN RAISE EXCEPTION 'Direct modification of host_verified_at is not allowed'; END IF;
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN RAISE EXCEPTION 'Direct modification of is_verified is not allowed'; END IF;
    IF NEW.is_face_verified IS DISTINCT FROM OLD.is_face_verified THEN RAISE EXCEPTION 'Direct modification of is_face_verified is not allowed'; END IF;
    IF NEW.face_verification_status IS DISTINCT FROM OLD.face_verification_status THEN RAISE EXCEPTION 'Direct modification of face_verification_status is not allowed'; END IF;
    IF NEW.face_verification_image IS DISTINCT FROM OLD.face_verification_image THEN RAISE EXCEPTION 'Direct modification of face_verification_image is not allowed'; END IF;
    IF NEW.face_verified_at IS DISTINCT FROM OLD.face_verified_at THEN RAISE EXCEPTION 'Direct modification of face_verified_at is not allowed'; END IF;
    IF NEW.verification_type IS DISTINCT FROM OLD.verification_type THEN RAISE EXCEPTION 'Direct modification of verification_type is not allowed'; END IF;
    IF NEW.face_hash IS DISTINCT FROM OLD.face_hash THEN RAISE EXCEPTION 'Direct modification of face_hash is not allowed'; END IF;
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN RAISE EXCEPTION 'Direct modification of is_blocked is not allowed'; END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN RAISE EXCEPTION 'Direct modification of is_banned is not allowed'; END IF;
    IF NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN RAISE EXCEPTION 'Direct modification of is_deleted is not allowed'; END IF;
    IF NEW.blocked_at IS DISTINCT FROM OLD.blocked_at THEN RAISE EXCEPTION 'Direct modification of blocked_at is not allowed'; END IF;
    IF NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason THEN RAISE EXCEPTION 'Direct modification of blocked_reason is not allowed'; END IF;
    IF NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at THEN RAISE EXCEPTION 'Direct modification of deletion_requested_at is not allowed'; END IF;
    IF NEW.deletion_scheduled_at IS DISTINCT FROM OLD.deletion_scheduled_at THEN RAISE EXCEPTION 'Direct modification of deletion_scheduled_at is not allowed'; END IF;

    -- Agency / identity / auth-contact / audit fields
    IF NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN RAISE EXCEPTION 'Direct modification of agency_id is not allowed'; END IF;
    IF NEW.is_agency_owner IS DISTINCT FROM OLD.is_agency_owner THEN RAISE EXCEPTION 'Direct modification of is_agency_owner is not allowed'; END IF;
    IF NEW.email IS DISTINCT FROM OLD.email THEN RAISE EXCEPTION 'Direct modification of email is not allowed'; END IF;
    IF NEW.phone_number IS DISTINCT FROM OLD.phone_number THEN RAISE EXCEPTION 'Direct modification of phone_number is not allowed'; END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN RAISE EXCEPTION 'Direct modification of phone_verified is not allowed'; END IF;
    IF NEW.device_id IS DISTINCT FROM OLD.device_id THEN RAISE EXCEPTION 'Direct modification of device_id is not allowed'; END IF;
    IF NEW.active_session_id IS DISTINCT FROM OLD.active_session_id THEN RAISE EXCEPTION 'Direct modification of active_session_id is not allowed'; END IF;
    IF NEW.registration_ip IS DISTINCT FROM OLD.registration_ip THEN RAISE EXCEPTION 'Direct modification of registration_ip is not allowed'; END IF;
    IF NEW.last_login_ip IS DISTINCT FROM OLD.last_login_ip THEN RAISE EXCEPTION 'Direct modification of last_login_ip is not allowed'; END IF;
    IF NEW.registration_device_info IS DISTINCT FROM OLD.registration_device_info THEN RAISE EXCEPTION 'Direct modification of registration_device_info is not allowed'; END IF;
    IF NEW.last_login_device_info IS DISTINCT FROM OLD.last_login_device_info THEN RAISE EXCEPTION 'Direct modification of last_login_device_info is not allowed'; END IF;
    IF NEW.registration_user_agent IS DISTINCT FROM OLD.registration_user_agent THEN RAISE EXCEPTION 'Direct modification of registration_user_agent is not allowed'; END IF;
    IF NEW.last_login_device IS DISTINCT FROM OLD.last_login_device THEN RAISE EXCEPTION 'Direct modification of last_login_device is not allowed'; END IF;
    IF NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN RAISE EXCEPTION 'Direct modification of last_login_at is not allowed'; END IF;

    -- Moderation counters and system-controlled profile assets
    IF NEW.phone_violation_count IS DISTINCT FROM OLD.phone_violation_count THEN RAISE EXCEPTION 'Direct modification of phone_violation_count is not allowed'; END IF;
    IF NEW.profile_photo_url IS DISTINCT FROM OLD.profile_photo_url THEN RAISE EXCEPTION 'Direct modification of profile_photo_url is not allowed'; END IF;
    IF NEW.host_photos IS DISTINCT FROM OLD.host_photos THEN RAISE EXCEPTION 'Direct modification of host_photos is not allowed'; END IF;
    IF NEW.frame_id IS DISTINCT FROM OLD.frame_id THEN RAISE EXCEPTION 'Direct modification of frame_id is not allowed'; END IF;
  END IF;

  RETURN NEW;
END;
$$;
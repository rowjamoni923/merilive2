CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bypass_protection boolean := COALESCE(current_setting('app.bypass_profile_protection', true), 'false') = 'true';
BEGIN
  IF _bypass_protection THEN
    RETURN NEW;
  END IF;

  IF current_setting('role', true) IN ('authenticated', 'anon') THEN
    IF NEW.coins IS DISTINCT FROM OLD.coins THEN RAISE EXCEPTION 'Direct modification of coins is not allowed'; END IF;
    IF NEW.beans IS DISTINCT FROM OLD.beans THEN RAISE EXCEPTION 'Direct modification of beans is not allowed'; END IF;
    IF NEW.diamonds IS DISTINCT FROM OLD.diamonds THEN RAISE EXCEPTION 'Direct modification of diamonds is not allowed'; END IF;
    IF NEW.total_earnings IS DISTINCT FROM OLD.total_earnings THEN RAISE EXCEPTION 'Direct modification of total_earnings is not allowed'; END IF;
    IF NEW.pending_earnings IS DISTINCT FROM OLD.pending_earnings THEN RAISE EXCEPTION 'Direct modification of pending_earnings is not allowed'; END IF;
    IF NEW.weekly_earnings IS DISTINCT FROM OLD.weekly_earnings THEN RAISE EXCEPTION 'Direct modification of weekly_earnings is not allowed'; END IF;
    IF NEW.total_consumption IS DISTINCT FROM OLD.total_consumption THEN RAISE EXCEPTION 'Direct modification of total_consumption is not allowed'; END IF;
    IF NEW.total_recharged IS DISTINCT FROM OLD.total_recharged THEN RAISE EXCEPTION 'Direct modification of total_recharged is not allowed'; END IF;
    IF NEW.is_host IS DISTINCT FROM OLD.is_host THEN RAISE EXCEPTION 'Direct modification of is_host is not allowed'; END IF;
    IF NEW.host_status IS DISTINCT FROM OLD.host_status THEN RAISE EXCEPTION 'Direct modification of host_status is not allowed'; END IF;
    IF NEW.host_level IS DISTINCT FROM OLD.host_level THEN RAISE EXCEPTION 'Direct modification of host_level is not allowed'; END IF;
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN RAISE EXCEPTION 'Direct modification of is_verified is not allowed'; END IF;
    IF NEW.is_face_verified IS DISTINCT FROM OLD.is_face_verified THEN RAISE EXCEPTION 'Direct modification of is_face_verified is not allowed'; END IF;
    IF NEW.user_level IS DISTINCT FROM OLD.user_level THEN RAISE EXCEPTION 'Direct modification of user_level is not allowed'; END IF;
    IF NEW.max_user_level IS DISTINCT FROM OLD.max_user_level THEN RAISE EXCEPTION 'Direct modification of max_user_level is not allowed'; END IF;
    IF NEW.current_vip_tier_id IS DISTINCT FROM OLD.current_vip_tier_id THEN RAISE EXCEPTION 'Direct modification of current_vip_tier_id is not allowed'; END IF;
    IF NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at THEN RAISE EXCEPTION 'Direct modification of vip_expires_at is not allowed'; END IF;
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN RAISE EXCEPTION 'Direct modification of is_blocked is not allowed'; END IF;
    IF NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN RAISE EXCEPTION 'Direct modification of agency_id is not allowed'; END IF;
    IF NEW.is_agency_owner IS DISTINCT FROM OLD.is_agency_owner THEN RAISE EXCEPTION 'Direct modification of is_agency_owner is not allowed'; END IF;
    IF NEW.face_hash IS DISTINCT FROM OLD.face_hash THEN RAISE EXCEPTION 'Direct modification of face_hash is not allowed'; END IF;
    IF NEW.phone_violation_count IS DISTINCT FROM OLD.phone_violation_count THEN RAISE EXCEPTION 'Direct modification of phone_violation_count is not allowed'; END IF;
  END IF;

  RETURN NEW;
END;
$function$;
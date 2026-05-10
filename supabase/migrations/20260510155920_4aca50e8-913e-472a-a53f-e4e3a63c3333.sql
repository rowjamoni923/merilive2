-- 1) Prompt-named ban check
CREATE OR REPLACE FUNCTION public.admin_check_live_ban(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_user_live_banned(p_user_id);
$$;

REVOKE ALL ON FUNCTION public.admin_check_live_ban(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_check_live_ban(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_check_live_ban(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_check_live_ban(uuid) IS
  'True if user has an active live_bans row (non-expired, is_active). Alias for prompt §2 / §12.';

-- 2) profiles.face_verification_status
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS face_verification_status text;

UPDATE public.profiles p
SET face_verification_status = 'approved'
WHERE coalesce(p.is_face_verified, false) = true
  AND (
    p.face_verification_status IS NULL
    OR trim(coalesce(p.face_verification_status, '')) = ''
    OR lower(trim(p.face_verification_status)) NOT IN ('approved', 'rejected', 'pending')
  );

UPDATE public.profiles p
SET face_verification_status = 'pending'
WHERE coalesce(p.is_face_verified, false) = false
  AND (
    p.face_verification_status IS NULL
    OR trim(coalesce(p.face_verification_status, '')) = ''
  );

CREATE OR REPLACE FUNCTION public.profiles_sync_face_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.is_face_verified, false) THEN
      NEW.face_verification_status := 'approved';
    ELSE
      NEW.face_verification_status := coalesce(
        nullif(trim(NEW.face_verification_status), ''),
        'pending'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF coalesce(NEW.is_face_verified, false) IS TRUE THEN
    NEW.face_verification_status := 'approved';
  ELSIF coalesce(OLD.is_face_verified, false) IS TRUE
    AND coalesce(NEW.is_face_verified, false) IS NOT TRUE THEN
    NEW.face_verification_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_face_verification_status ON public.profiles;
CREATE TRIGGER trg_profiles_sync_face_verification_status
BEFORE INSERT OR UPDATE OF is_face_verified ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_sync_face_verification_status();

COMMENT ON COLUMN public.profiles.face_verification_status IS
  'Go-live gate: approved | pending | rejected. Kept in sync with is_face_verified for legacy clients.';

-- 3) Replace can_user_go_live
CREATE OR REPLACE FUNCTION public.can_user_go_live()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_gender text;
  v_is_host boolean;
  v_face_status text;
  v_host_status text;
  v_live_flag text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'auth', 'reason', 'Sign in required.');
  END IF;

  SELECT lower(trim(coalesce(p.gender, ''))),
         coalesce(p.is_host, false),
         lower(trim(coalesce(p.face_verification_status, ''))),
         lower(trim(coalesce(p.host_status::text, '')))
  INTO v_gender, v_is_host, v_face_status, v_host_status
  FROM public.profiles p
  WHERE p.id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'profile', 'reason', 'Profile not found.');
  END IF;

  IF v_gender IS DISTINCT FROM 'female' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'gender', 'reason', 'Only verified female hosts can go live.');
  END IF;

  IF NOT v_is_host THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'not_host', 'reason', 'Complete host onboarding and face verification first.');
  END IF;

  IF v_face_status IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'face', 'reason', 'Face verification must be approved.');
  END IF;

  IF v_is_host AND v_host_status = 'agency_required' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'agency_required', 'reason', 'Join an agency before going live as a registered host.');
  END IF;

  IF public.admin_check_live_ban(uid) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'banned', 'reason', 'You have an active live ban.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.live_streams ls
    WHERE ls.host_id = uid
      AND ls.ended_at IS NULL
      AND (
        coalesce(ls.is_active, false) = true
        OR lower(trim(coalesce(ls.status::text, ''))) IN ('live', 'starting')
      )
  ) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'already_live', 'reason', 'You already have an active live stream.');
  END IF;

  SELECT coalesce(lower(trim(setting_value::text)), 'true')
    INTO v_live_flag
  FROM public.app_settings
  WHERE setting_key = 'live_streaming_enabled'
  LIMIT 1;

  IF v_live_flag IS NULL THEN
    v_live_flag := 'true';
  END IF;

  IF v_live_flag IN ('false', '0', 'off', 'no') THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'disabled', 'reason', 'Live streaming is temporarily disabled.');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'code', 'ok', 'reason', '');
END;
$$;

REVOKE ALL ON FUNCTION public.can_user_go_live() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_user_go_live() FROM anon;
GRANT EXECUTE ON FUNCTION public.can_user_go_live() TO authenticated;

COMMENT ON FUNCTION public.can_user_go_live() IS
  'Section 2 hard gate: female host, face_verification_status=approved, agency if required, admin_check_live_ban, no active live row, live_streaming_enabled.';

-- 4) Expose face_verification_status on profiles_public
DROP VIEW IF EXISTS public.profiles_public CASCADE;

CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT
  id, username, display_name, bio, avatar_url, cover_url,
  country_code, country_name, country_flag, age, gender,
  is_online, is_verified, last_seen_at, last_seen, last_active_at,
  is_host, host_status, host_level, host_availability,
  is_face_verified, face_verification_status, face_verified_at, host_verified_at, verification_type,
  agency_id, is_agency_owner, is_in_call,
  call_rate_per_minute, total_call_minutes, total_calls_received,
  user_level, max_user_level, tags, city, region, hide_location,
  frame_id, equipped_frame_id, equipped_entrance_id, equipped_bubble_id,
  equipped_vehicle_id, equipped_medal_id, equipped_noble_card_id,
  equipped_entry_banner_id, equipped_entry_name_bar_id,
  current_vip_tier_id, vip_tier, vip_expires_at,
  weekly_earnings, total_earnings,
  is_blocked, is_banned, is_deleted,
  blocked_at, blocked_reason,
  profile_photo_url, host_photos, app_uid, created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;
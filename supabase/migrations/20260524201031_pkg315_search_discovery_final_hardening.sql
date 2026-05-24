-- Pkg315 Search & Discovery final hardening
-- Fix remaining exposure paths: admin-blocked profiles in public search/view + legacy search RPCs.

DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.username,
  p.display_name,
  p.bio,
  p.avatar_url,
  p.cover_url,
  p.country_code,
  p.country_name,
  p.country_flag,
  p.age,
  p.gender,
  p.is_online,
  p.is_verified,
  p.last_seen_at,
  p.last_seen,
  p.last_active_at,
  p.is_host,
  p.host_status,
  p.host_level,
  p.host_availability,
  p.is_face_verified,
  p.face_verification_status,
  p.face_verified_at,
  p.host_verified_at,
  p.verification_type,
  p.agency_id,
  p.is_agency_owner,
  p.is_in_call,
  p.call_rate_per_minute,
  p.total_call_minutes,
  p.total_calls_received,
  p.user_level,
  p.max_user_level,
  p.tags,
  CASE WHEN COALESCE(p.hide_location,false) THEN NULL ELSE p.city END   AS city,
  CASE WHEN COALESCE(p.hide_location,false) THEN NULL ELSE p.region END AS region,
  p.hide_location,
  p.frame_id,
  p.equipped_frame_id,
  p.equipped_entrance_id,
  p.equipped_bubble_id,
  p.equipped_vehicle_id,
  p.equipped_medal_id,
  p.equipped_noble_card_id,
  p.equipped_entry_banner_id,
  p.equipped_entry_name_bar_id,
  p.current_vip_tier_id,
  p.vip_tier,
  p.vip_expires_at,
  p.weekly_earnings,
  p.total_earnings,
  p.profile_photo_url,
  p.host_photos,
  p.app_uid,
  p.created_at
FROM public.profiles p
WHERE COALESCE(p.is_banned,false) = false
  AND COALESCE(p.is_deleted,false) = false
  AND COALESCE(p.is_blocked,false) = false;

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;
COMMENT ON VIEW public.profiles_public IS 'Public-safe profile view. Hides coins/beans/blocked_reason/IP/device. Masks city/region when hide_location=true. Excludes banned/blocked/deleted users.';

CREATE OR REPLACE FUNCTION public.search_user_by_app_uid(_app_uid text)
RETURNS TABLE(id uuid, display_name text, avatar_url text, app_uid varchar, is_host boolean, is_online boolean, user_level integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_uid text := regexp_replace(COALESCE(_app_uid, ''), '[^0-9]', '', 'g');
BEGIN
  IF length(_clean_uid) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.app_uid, p.is_host, p.is_online, p.user_level
  FROM public.profiles p
  WHERE p.app_uid = _clean_uid
    AND COALESCE(p.is_banned,false) = false
    AND COALESCE(p.is_deleted,false) = false
    AND COALESCE(p.is_blocked,false) = false
    AND (
      auth.uid() IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.blocked_users bu
        WHERE (bu.blocker_id = auth.uid() AND bu.blocked_id = p.id)
           OR (bu.blocker_id = p.id AND bu.blocked_id = auth.uid())
      )
    )
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_user_by_id(_search_id text)
RETURNS TABLE(id uuid, display_name text, avatar_url text, app_uid varchar, is_host boolean, is_online boolean, user_level integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _raw text := btrim(COALESCE(_search_id, ''));
  _clean_uid text := regexp_replace(COALESCE(_search_id, ''), '[^0-9]', '', 'g');
  _uuid uuid := NULL;
BEGIN
  IF _raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    _uuid := _raw::uuid;
  END IF;

  IF _uuid IS NULL AND length(_clean_uid) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.app_uid, p.is_host, p.is_online, p.user_level
  FROM public.profiles p
  WHERE (p.app_uid = _clean_uid OR (_uuid IS NOT NULL AND p.id = _uuid))
    AND COALESCE(p.is_banned,false) = false
    AND COALESCE(p.is_deleted,false) = false
    AND COALESCE(p.is_blocked,false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users bu
      WHERE (bu.blocker_id = auth.uid() AND bu.blocked_id = p.id)
         OR (bu.blocker_id = p.id AND bu.blocked_id = auth.uid())
    )
  LIMIT 5;
END;
$$;

REVOKE ALL ON FUNCTION public.search_user_by_app_uid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_user_by_app_uid(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.search_user_by_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_user_by_id(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_followers_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.follower_id = NEW.following_id THEN
    RAISE EXCEPTION 'cannot follow yourself' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id IN (NEW.follower_id, NEW.following_id)
      AND (COALESCE(is_banned,false) OR COALESCE(is_deleted,false) OR COALESCE(is_blocked,false))
  ) THEN
    RAISE EXCEPTION 'cannot follow unavailable user' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = NEW.following_id AND blocked_id = NEW.follower_id)
       OR (blocker_id = NEW.follower_id  AND blocked_id = NEW.following_id)
  ) THEN
    RAISE EXCEPTION 'blocked relationship prevents follow' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

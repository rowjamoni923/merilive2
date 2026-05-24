-- Pkg315: Search & Discovery hardening

-- 1) profiles_public view: drop earnings + moderation columns; filter banned/blocked/deleted; honor hide_location
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public AS
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
  p.profile_photo_url,
  p.host_photos,
  p.app_uid,
  p.created_at
FROM public.profiles p
WHERE COALESCE(p.is_banned,false) = false
  AND COALESCE(p.is_deleted,false) = false;

GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO anon;
COMMENT ON VIEW public.profiles_public IS 'Public-safe profile view. Excludes coins/beans/earnings/blocked_reason/IP/device. Hides location when hide_location=true. Banned/deleted users filtered out.';

-- 2) followers table: add INSERT / DELETE policies for the follower themselves
--    + guard trigger (no self-follow, target not banned/deleted, not mutually blocked)

DROP POLICY IF EXISTS "Users can follow others" ON public.followers;
CREATE POLICY "Users can follow others"
ON public.followers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON public.followers;
CREATE POLICY "Users can unfollow"
ON public.followers
FOR DELETE
TO authenticated
USING (auth.uid() = follower_id);

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
    WHERE id = NEW.following_id
      AND (COALESCE(is_banned,false) OR COALESCE(is_deleted,false))
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

DROP TRIGGER IF EXISTS guard_followers_insert_trg ON public.followers;
CREATE TRIGGER guard_followers_insert_trg
BEFORE INSERT ON public.followers
FOR EACH ROW
EXECUTE FUNCTION public.guard_followers_insert();

-- Unique pair to prevent duplicate follows
CREATE UNIQUE INDEX IF NOT EXISTS followers_unique_pair_idx
ON public.followers (follower_id, following_id);
-- ============================================================
-- FIX: Ban/Block visibility, live_bans security, and admin data access
-- ============================================================

-- 1) Harden live_bans: enable RLS, replace permissive "true" policy
ALTER TABLE public.live_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access" ON public.live_bans;
DROP POLICY IF EXISTS "Admin full access to live_bans" ON public.live_bans;
DROP POLICY IF EXISTS "Users see own bans" ON public.live_bans;

CREATE POLICY "Admins manage live_bans"
  ON public.live_bans
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users view own live_bans"
  ON public.live_bans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2) Add a service-role-friendly admin policy for blocked_users so admin
--    moderation tools can read all blocks via SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Admins manage blocked_users" ON public.blocked_users;
CREATE POLICY "Admins manage blocked_users"
  ON public.blocked_users
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3) Same for user_blocks
DROP POLICY IF EXISTS "Admins manage user_blocks" ON public.user_blocks;
CREATE POLICY "Admins manage user_blocks"
  ON public.user_blocks
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4) Prevent duplicate user_blocks (so .insert() doesn't error spuriously)
CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_unique_pair
  ON public.user_blocks (blocker_id, blocked_id);

CREATE UNIQUE INDEX IF NOT EXISTS blocked_users_unique_pair
  ON public.blocked_users (blocker_id, blocked_id);

-- 5) Extend profiles_public view to include moderation fields admin pages need
DROP VIEW IF EXISTS public.profiles_public CASCADE;

CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT
  id, username, display_name, bio, avatar_url, cover_url,
  country_code, country_name, country_flag, age, gender,
  is_online, is_verified, last_seen_at, last_seen, last_active_at,
  is_host, host_status, host_level, host_availability,
  is_face_verified, face_verified_at, host_verified_at, verification_type,
  agency_id, is_agency_owner, is_in_call,
  call_rate_per_minute, total_call_minutes, total_calls_received,
  user_level, max_user_level, tags, city, region, hide_location,
  frame_id, equipped_frame_id, equipped_entrance_id, equipped_bubble_id,
  equipped_vehicle_id, equipped_medal_id, equipped_noble_card_id,
  equipped_entry_banner_id, equipped_entry_name_bar_id,
  current_vip_tier_id, vip_tier, vip_expires_at,
  weekly_earnings, total_earnings,
  is_blocked, is_banned, is_deleted,
  -- Moderation visibility (no PII): only block metadata
  blocked_at, blocked_reason,
  profile_photo_url, host_photos, app_uid, created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- 6) Helper RPC: list blocked users for moderators (bypasses RLS but
--    still gates by admin check). Returns minimal moderation fields only.
CREATE OR REPLACE FUNCTION public.admin_list_blocked_users(
  _search text DEFAULT NULL,
  _limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  blocked_at timestamptz,
  blocked_reason text,
  is_host boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url,
         p.blocked_at, p.blocked_reason, p.is_host
  FROM public.profiles p
  WHERE p.is_blocked = true
    AND (_search IS NULL OR _search = ''
         OR p.display_name ILIKE '%' || _search || '%'
         OR p.app_uid ILIKE '%' || _search || '%')
  ORDER BY p.blocked_at DESC NULLS LAST
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_blocked_users(text, int) TO authenticated;

-- 7) Helper RPC: list blocked agencies for moderators
CREATE OR REPLACE FUNCTION public.admin_list_blocked_agencies(
  _search text DEFAULT NULL,
  _limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  name text,
  agency_code text,
  blocked_at timestamptz,
  blocked_reason text,
  total_hosts int,
  owner_id uuid,
  owner_display_name text,
  owner_avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT a.id, a.name, a.agency_code,
         a.blocked_at, a.blocked_reason, COALESCE(a.total_hosts, 0)::int,
         a.owner_id, p.display_name, p.avatar_url
  FROM public.agencies a
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  WHERE a.is_blocked = true
    AND (_search IS NULL OR _search = ''
         OR a.name ILIKE '%' || _search || '%'
         OR a.agency_code ILIKE '%' || _search || '%')
  ORDER BY a.blocked_at DESC NULLS LAST
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_blocked_agencies(text, int) TO authenticated;

-- 8) Helper RPC: list active live bans for the AdminLiveBans page
CREATE OR REPLACE FUNCTION public.admin_list_live_bans(
  _only_active boolean DEFAULT true,
  _limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  ban_reason text,
  violation_type text,
  warning_count int,
  ban_start timestamptz,
  ban_end timestamptz,
  ban_duration_hours int,
  is_active boolean,
  auto_banned boolean,
  unbanned_by uuid,
  unbanned_at timestamptz,
  display_name text,
  avatar_url text,
  app_uid text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  RETURN QUERY
  SELECT b.id, b.user_id, b.ban_reason, b.violation_type,
         COALESCE(b.warning_count, 0)::int,
         b.ban_start, b.ban_end, b.ban_duration_hours,
         b.is_active, COALESCE(b.auto_banned, false),
         b.unbanned_by, b.unbanned_at,
         p.display_name, p.avatar_url, p.app_uid
  FROM public.live_bans b
  LEFT JOIN public.profiles p ON p.id = b.user_id
  WHERE (NOT _only_active OR b.is_active = true)
  ORDER BY b.ban_start DESC NULLS LAST
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_live_bans(boolean, int) TO authenticated;
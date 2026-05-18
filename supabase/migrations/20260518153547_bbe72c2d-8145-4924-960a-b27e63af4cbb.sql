-- Ensure app/admin broadcast rows exist for verification + host feed profile changes
INSERT INTO public.admin_broadcast (topic, version, last_event, last_row_id, updated_at)
VALUES
  ('face_verification_submissions', 0, 'INIT', NULL, now()),
  ('profiles', 0, 'INIT', NULL, now())
ON CONFLICT (topic) DO NOTHING;

-- Admin panel: face/host verification submissions must instantly refresh counts + tabs.
DROP TRIGGER IF EXISTS tg_admin_broadcast_face_verification_submissions ON public.face_verification_submissions;
CREATE TRIGGER tg_admin_broadcast_face_verification_submissions
AFTER INSERT OR UPDATE OR DELETE ON public.face_verification_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_admin_broadcast_bump('face_verification_submissions');

-- App: only broadcast profile changes that affect public host visibility/cards/status.
-- This avoids turning all profile edits/balance changes into realtime feed refreshes.
DROP TRIGGER IF EXISTS tg_admin_broadcast_profiles_host_visibility ON public.profiles;
CREATE TRIGGER tg_admin_broadcast_profiles_host_visibility
AFTER UPDATE OF
  is_host,
  host_status,
  is_face_verified,
  is_verified,
  gender,
  host_availability,
  avatar_url,
  display_name,
  username,
  country_code,
  country_flag,
  is_online,
  is_in_call,
  call_rate_per_minute,
  user_level,
  host_level
ON public.profiles
FOR EACH ROW
WHEN (
  OLD.is_host IS DISTINCT FROM NEW.is_host
  OR OLD.host_status IS DISTINCT FROM NEW.host_status
  OR OLD.is_face_verified IS DISTINCT FROM NEW.is_face_verified
  OR OLD.is_verified IS DISTINCT FROM NEW.is_verified
  OR OLD.gender IS DISTINCT FROM NEW.gender
  OR OLD.host_availability IS DISTINCT FROM NEW.host_availability
  OR OLD.avatar_url IS DISTINCT FROM NEW.avatar_url
  OR OLD.display_name IS DISTINCT FROM NEW.display_name
  OR OLD.username IS DISTINCT FROM NEW.username
  OR OLD.country_code IS DISTINCT FROM NEW.country_code
  OR OLD.country_flag IS DISTINCT FROM NEW.country_flag
  OR OLD.is_online IS DISTINCT FROM NEW.is_online
  OR OLD.is_in_call IS DISTINCT FROM NEW.is_in_call
  OR OLD.call_rate_per_minute IS DISTINCT FROM NEW.call_rate_per_minute
  OR OLD.user_level IS DISTINCT FROM NEW.user_level
  OR OLD.host_level IS DISTINCT FROM NEW.host_level
)
EXECUTE FUNCTION public.tg_admin_broadcast_bump('profiles');

DROP TRIGGER IF EXISTS tg_admin_broadcast_profiles_host_visibility_insert ON public.profiles;
CREATE TRIGGER tg_admin_broadcast_profiles_host_visibility_insert
AFTER INSERT ON public.profiles
FOR EACH ROW
WHEN (
  NEW.is_host = true
  OR NEW.host_status IS NOT NULL
  OR NEW.is_face_verified = true
)
EXECUTE FUNCTION public.tg_admin_broadcast_bump('profiles');
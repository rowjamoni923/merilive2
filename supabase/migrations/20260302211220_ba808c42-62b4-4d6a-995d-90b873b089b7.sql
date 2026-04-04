-- Backfill approved face submissions into profile flags with bypass enabled for this transaction
SELECT set_config('app.bypass_profile_protection', 'true', true);

WITH latest_approved AS (
  SELECT DISTINCT ON (f.user_id)
    f.user_id,
    f.profile_photo_url,
    f.full_name
  FROM public.face_verification_submissions f
  WHERE f.status = 'approved'
  ORDER BY f.user_id, f.reviewed_at DESC NULLS LAST, f.created_at DESC
)
UPDATE public.profiles p
SET
  is_verified = true,
  is_face_verified = true,
  face_verified_at = COALESCE(p.face_verified_at, now()),
  is_host = CASE WHEN lower(COALESCE(p.gender, 'male')) = 'female' THEN true ELSE false END,
  host_status = CASE WHEN lower(COALESCE(p.gender, 'male')) = 'female' THEN 'approved' ELSE NULL END,
  avatar_url = COALESCE(la.profile_photo_url, p.avatar_url),
  display_name = COALESCE(NULLIF(trim(la.full_name), ''), p.display_name),
  updated_at = now()
FROM latest_approved la
WHERE p.id = la.user_id
  AND COALESCE(p.is_blocked, false) = false;
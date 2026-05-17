WITH object_groups AS (
  SELECT
    split_part(o.name, '/', 1)::uuid AS user_id,
    max(o.created_at) AS latest_object_at,
    max(o.name) FILTER (WHERE split_part(o.name, '/', 2) = 'photos') AS latest_profile_photo_path,
    max(o.name) FILTER (WHERE split_part(o.name, '/', 2) = 'profile-photos') AS latest_user_profile_photo_path,
    max(o.name) FILTER (WHERE split_part(o.name, '/', 2) = 'videos') AS latest_intro_video_path,
    max(o.name) FILTER (WHERE split_part(o.name, '/', 2) = 'face-videos') AS latest_face_video_path
  FROM storage.objects o
  WHERE o.bucket_id = 'face-verification'
    AND o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
  GROUP BY split_part(o.name, '/', 1)::uuid
), latest_host_photos AS (
  SELECT
    user_id,
    array_agg('https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/face-verification/' || name ORDER BY created_at DESC) AS host_photo_urls
  FROM (
    SELECT
      split_part(o.name, '/', 1)::uuid AS user_id,
      o.name,
      o.created_at,
      row_number() OVER (PARTITION BY split_part(o.name, '/', 1)::uuid ORDER BY o.created_at DESC) AS rn
    FROM storage.objects o
    WHERE o.bucket_id = 'face-verification'
      AND split_part(o.name, '/', 2) = 'host-photos'
      AND o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
  ) ranked
  WHERE rn <= 3
  GROUP BY user_id
), recoverable AS (
  SELECT
    og.user_id,
    og.latest_object_at,
    og.latest_profile_photo_path,
    og.latest_user_profile_photo_path,
    og.latest_intro_video_path,
    og.latest_face_video_path,
    lhp.host_photo_urls,
    p.display_name,
    p.age,
    p.language,
    p.avatar_url
  FROM object_groups og
  JOIN public.profiles p ON p.id = og.user_id
  LEFT JOIN latest_host_photos lhp ON lhp.user_id = og.user_id
  WHERE og.latest_face_video_path IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.face_verification_submissions s
      WHERE s.user_id = og.user_id
        AND s.status IN ('pending', 'submitted', 'under_review')
    )
    AND (
      SELECT coalesce(max(s.created_at), 'epoch'::timestamptz)
      FROM public.face_verification_submissions s
      WHERE s.user_id = og.user_id
    ) < og.latest_object_at
)
INSERT INTO public.face_verification_submissions (
  user_id,
  verification_type,
  status,
  full_name,
  age,
  language,
  profile_photo_url,
  video_url,
  face_image_url,
  selfie_url,
  host_photos,
  admin_notes,
  ai_analysis,
  created_at
)
SELECT
  r.user_id,
  CASE WHEN r.latest_intro_video_path IS NOT NULL OR coalesce(array_length(r.host_photo_urls, 1), 0) > 0 THEN 'host' ELSE 'face' END,
  'submitted',
  coalesce(nullif(r.display_name, ''), 'Unknown'),
  r.age,
  r.language,
  coalesce(
    CASE WHEN r.latest_profile_photo_path IS NOT NULL THEN 'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/face-verification/' || r.latest_profile_photo_path END,
    CASE WHEN r.latest_user_profile_photo_path IS NOT NULL THEN 'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/face-verification/' || r.latest_user_profile_photo_path END,
    r.avatar_url
  ),
  CASE WHEN r.latest_intro_video_path IS NOT NULL THEN 'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/face-verification/' || r.latest_intro_video_path END,
  'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/face-verification/' || r.latest_face_video_path,
  'https://ayjdlvuurscxucatbbah.supabase.co/storage/v1/object/public/face-verification/' || r.latest_face_video_path,
  r.host_photo_urls,
  '[RECOVERED] Review row created from private face-verification uploads that existed without an admin review entry.',
  jsonb_build_object('recovered_from_storage', true, 'recovered_at', now()),
  r.latest_object_at
FROM recoverable r;
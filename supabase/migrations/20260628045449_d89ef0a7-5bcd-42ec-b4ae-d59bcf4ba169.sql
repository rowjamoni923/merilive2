CREATE OR REPLACE FUNCTION public.face_verification_is_retry_required(
  _status text,
  _admin_notes text,
  _ai_analysis jsonb,
  _profile_photo_url text,
  _video_url text,
  _face_image_url text,
  _front_url text,
  _selfie_url text,
  _host_photos text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- Final admin/AI decisions must always leave the pending queue immediately.
    -- Old retry/orphan/upload metadata can remain on legacy rows, but it must not
    -- override a terminal approved/rejected status in admin lists or counters.
    WHEN public.face_verification_status_bucket(_status) IN ('approved','rejected') THEN false
    WHEN lower(trim(coalesce(_status, ''))) IN ('needs_retry','retry_required','upload_failed','upload_incomplete') THEN true
    WHEN lower(coalesce(_ai_analysis->>'requires_resubmit', '')) IN ('true','1','yes') THEN true
    WHEN lower(coalesce(_ai_analysis->>'orphan_media', '')) IN ('true','1','yes') THEN true
    WHEN jsonb_typeof(coalesce(_ai_analysis, '{}'::jsonb)->'retry_required') IN ('object','array','string') THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan_media_missing%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%orphan submission%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload incomplete%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload-incomplete%' THEN true
    WHEN lower(coalesce(_admin_notes, '')) LIKE '%upload was incomplete%' THEN true
    WHEN lower(coalesce(_ai_analysis->>'upload_pending', '')) NOT IN ('true','1','yes')
      AND NOT (
        public.face_verification_has_renderable_media(_profile_photo_url)
        OR public.face_verification_has_renderable_media(_video_url)
        OR public.face_verification_has_renderable_media(_face_image_url)
        OR public.face_verification_has_renderable_media(_front_url)
        OR public.face_verification_has_renderable_media(_selfie_url)
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(_host_photos, ARRAY[]::text[])) AS hp(url)
          WHERE public.face_verification_has_renderable_media(hp.url)
        )
      ) THEN true
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION public.face_verification_is_retry_required(text,text,jsonb,text,text,text,text,text,text[]) TO anon, authenticated, service_role;
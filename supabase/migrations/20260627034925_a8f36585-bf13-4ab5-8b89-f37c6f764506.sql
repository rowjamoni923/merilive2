SELECT set_config('app.bypass_terminal_status_guard', 'true', true);
SELECT set_config('app.bypass_profile_protection', 'true', true);

UPDATE public.face_verification_submissions s
   SET status = 'rejected',
       reviewed_at = COALESCE(s.reviewed_at, now()),
       rejection_reason = COALESCE(
         NULLIF(s.rejection_reason, ''),
         'Upload was incomplete — your photo/video/live scan never reached the server. Please resubmit.'
       ),
       admin_notes = concat_ws(E'\n', NULLIF(trim(coalesce(s.admin_notes, '')), ''),
         '[system-fix 20260627050000] Orphan submission auto-rejected so the user can resubmit.'),
       ai_analysis = COALESCE(s.ai_analysis, '{}'::jsonb) || jsonb_build_object(
         'upload_pending', false,
         'orphan_media', true,
         'requires_resubmit', true,
         'auto_rejected_reason', 'orphan_media_missing'
       ),
       updated_at = now()
 WHERE public.face_verification_status_bucket(s.status) = 'pending'
   AND s.profile_photo_url IS NULL
   AND s.video_url IS NULL
   AND s.face_image_url IS NULL
   AND s.front_url IS NULL
   AND s.selfie_url IS NULL
   AND COALESCE(array_length(s.host_photos, 1), 0) = 0
   AND s.created_at < now() - interval '2 minutes';

UPDATE public.profiles p
   SET is_face_verified = false,
       face_verification_status = 'rejected',
       face_verification_image = NULL,
       face_verified_at = NULL,
       updated_at = now()
  FROM public.face_verification_submissions s
 WHERE s.user_id = p.id
   AND s.status = 'rejected'
   AND (s.ai_analysis->>'auto_rejected_reason') = 'orphan_media_missing'
   AND (p.is_face_verified IS NOT TRUE OR p.face_verification_status IS DISTINCT FROM 'approved');
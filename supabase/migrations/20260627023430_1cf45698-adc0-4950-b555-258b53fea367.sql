-- Mark the two known orphan pending submissions (no media at all) so admins
-- see a clear "upload incomplete" badge instead of an empty card with media
-- fields all null. The original media was lost because the client locked the
-- "Under Review" screen before uploads landed. New code path always persists
-- media BEFORE locking.
UPDATE public.face_verification_submissions
   SET admin_notes = 'Upload incomplete — original media never reached storage. Ask user to resubmit (orphan from pre-fix flow).',
       ai_analysis = COALESCE(ai_analysis, '{}'::jsonb) || jsonb_build_object(
         'upload_pending', false,
         'orphan_media', true,
         'requires_resubmit', true
       ),
       updated_at = now()
 WHERE id IN ('8c65a851-e328-4a46-85a7-6114f6537152','c867c6b5-c6a1-4446-8c71-d7c6cb0ec9b1')
   AND profile_photo_url IS NULL
   AND face_image_url IS NULL
   AND front_url IS NULL;
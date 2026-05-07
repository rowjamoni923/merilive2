ALTER TABLE public.face_verification_submissions
  ADD COLUMN IF NOT EXISTS front_url text,
  ADD COLUMN IF NOT EXISTS left_url text,
  ADD COLUMN IF NOT EXISTS right_url text,
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS ip_hash text;

COMMENT ON COLUMN public.face_verification_submissions.front_url IS 'Private storage path/URL for straight-face capture (Section 07).';
COMMENT ON COLUMN public.face_verification_submissions.left_url IS 'Private storage path/URL for left-angle capture (Section 07).';
COMMENT ON COLUMN public.face_verification_submissions.right_url IS 'Private storage path/URL for right-angle capture (Section 07).';
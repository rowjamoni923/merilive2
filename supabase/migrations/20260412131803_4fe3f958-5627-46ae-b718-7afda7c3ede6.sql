-- host_applications missing columns
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS current_step integer DEFAULT 1;
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS face_match_score numeric;
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS face_verification_image_url text;
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS face_verification_status text;
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS is_complete boolean DEFAULT false;
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.host_applications ADD COLUMN IF NOT EXISTS video_duration_seconds integer;

-- host_levels missing column
ALTER TABLE public.host_levels ADD COLUMN IF NOT EXISTS beans_required integer DEFAULT 0;
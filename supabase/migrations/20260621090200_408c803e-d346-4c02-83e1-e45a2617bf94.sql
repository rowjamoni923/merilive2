-- Phase 3: Auto-record default ON (Bigo/Chamet industry standard)
ALTER TABLE public.profiles ALTER COLUMN auto_record_live SET DEFAULT true;

UPDATE public.profiles
SET auto_record_live = true
WHERE host_status = 'approved'
  AND COALESCE(is_face_verified, false) = true
  AND COALESCE(auto_record_live, false) = false;
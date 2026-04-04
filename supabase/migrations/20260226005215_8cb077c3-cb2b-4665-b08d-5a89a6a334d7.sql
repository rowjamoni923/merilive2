
-- Fix overly permissive RLS policy on live_face_violations
DROP POLICY IF EXISTS "Service role full access face violations" ON public.live_face_violations;

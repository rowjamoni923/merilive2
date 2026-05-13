
-- Pkg36 security hardening: remove overly broad SELECT policies
DROP POLICY IF EXISTS "a_read_admin_sects" ON public.admin_sections;
DROP POLICY IF EXISTS "rekognition_shards_select_auth" ON public.rekognition_shards;
DROP POLICY IF EXISTS "public read active verified traders" ON public.topup_helpers;

-- Re-add helper trader read for authenticated users only (anon removed)
CREATE POLICY "authenticated read active verified traders"
ON public.topup_helpers
FOR SELECT
TO authenticated
USING (is_active = true AND is_verified = true);

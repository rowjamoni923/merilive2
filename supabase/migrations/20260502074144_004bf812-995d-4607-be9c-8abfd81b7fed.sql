
-- =========================================================
-- 1. STORAGE: remove blanket public-read, lock sensitive buckets
-- =========================================================

-- Drop blanket public-read policies
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Access All Buckets" ON storage.objects;
DROP POLICY IF EXISTS "Public buckets are readable by everyone" ON storage.objects;

-- Mark sensitive buckets as private
UPDATE storage.buckets
SET public = false
WHERE id IN (
  'face-verification',
  'host-verification',
  'payment-proofs',
  'payment-screenshots',
  'helper-screenshots',
  'rating-screenshots',
  'support-attachments',
  'live-recordings'
);

-- New scoped public read: only buckets explicitly flagged public
CREATE POLICY "Public read for public buckets"
ON storage.objects
FOR SELECT
USING (
  bucket_id IN (SELECT id FROM storage.buckets WHERE public = true)
);

-- Owner read for any bucket (private buckets included)
CREATE POLICY "Owner can read own objects"
ON storage.objects
FOR SELECT
USING (auth.uid() = owner);

-- Admin session read everything
CREATE POLICY "Admin session can read any object"
ON storage.objects
FOR SELECT
USING (is_active_admin_session());

-- =========================================================
-- 2. helper_topup_requests / helper_upgrade_requests SELECT fix
-- =========================================================

DROP POLICY IF EXISTS u_read_hlp_topup ON public.helper_topup_requests;
CREATE POLICY u_read_hlp_topup
ON public.helper_topup_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.topup_helpers th
    WHERE th.id = helper_topup_requests.helper_id
      AND th.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS u_read_hlp_upgr ON public.helper_upgrade_requests;
CREATE POLICY u_read_hlp_upgr
ON public.helper_upgrade_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.topup_helpers th
    WHERE th.id = helper_upgrade_requests.helper_id
      AND th.user_id = auth.uid()
  )
);

-- Fix INSERT policy on upgrade requests too (same broken comparison)
DROP POLICY IF EXISTS u_ins_hlp_upgr ON public.helper_upgrade_requests;
CREATE POLICY u_ins_hlp_upgr
ON public.helper_upgrade_requests
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.topup_helpers th
    WHERE th.id = helper_upgrade_requests.helper_id
      AND th.user_id = auth.uid()
  )
);

-- =========================================================
-- 3. account_lockouts: stop authenticated enumeration
-- =========================================================

DROP POLICY IF EXISTS "Authenticated can check lockout status" ON public.account_lockouts;

-- Users can only check lockout for their own email/phone
CREATE POLICY "Users can check own lockout"
ON public.account_lockouts
FOR SELECT
TO authenticated
USING (
  identifier = (auth.jwt() ->> 'email')
  OR identifier = (auth.jwt() ->> 'phone')
);

-- =============================================
-- PRE-FIX: Add missing unique constraint for agency_performance
-- Required by update_host_hours_on_stream_end() trigger
-- =============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_performance_unique 
ON public.agency_performance (agency_id, period_type, period_start);

-- =============================================
-- FIX 1: Clean up stale live streams (stuck is_active=true)
-- =============================================
UPDATE public.live_streams 
SET is_active = false, 
    ended_at = NOW(), 
    viewer_count = 0
WHERE is_active = true 
  AND last_heartbeat < NOW() - INTERVAL '2 minutes';

-- =============================================
-- FIX 2: Reels auto-approval - change default to true
-- =============================================
ALTER TABLE public.reels 
ALTER COLUMN is_approved SET DEFAULT true;

-- Also approve any existing unapproved reels that are active
UPDATE public.reels 
SET is_approved = true 
WHERE is_approved = false AND is_active = true;

-- =============================================
-- FIX 3: Link missing admin user_id for sazzadshifa776
-- =============================================
UPDATE public.admin_users 
SET user_id = (
  SELECT id FROM auth.users WHERE email = 'sazzadshifa776@gmail.com' LIMIT 1
)
WHERE email = 'sazzadshifa776@gmail.com' 
  AND user_id IS NULL
  AND EXISTS (SELECT 1 FROM auth.users WHERE email = 'sazzadshifa776@gmail.com');

-- =============================================
-- FIX 4: Add missing INSERT policy for live_streams
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'live_streams' 
    AND cmd = 'INSERT'
  ) THEN
    CREATE POLICY "Hosts can create live streams"
    ON public.live_streams
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = host_id);
  END IF;
END $$;

-- =============================================
-- FIX 5: Improve stale stream cleanup function
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleaned_count integer;
BEGIN
  UPDATE live_streams
  SET is_active = false,
      ended_at = NOW(),
      viewer_count = 0
  WHERE is_active = true
    AND last_heartbeat < NOW() - INTERVAL '90 seconds';
  
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  
  -- Safety net: close any streams active for more than 12 hours
  UPDATE live_streams
  SET is_active = false,
      ended_at = NOW(),
      viewer_count = 0
  WHERE is_active = true
    AND created_at < NOW() - INTERVAL '12 hours';
  
  RETURN cleaned_count;
END;
$$;
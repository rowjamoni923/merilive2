
-- 1. Allow authenticated users to SELECT party_rooms (they need to see active rooms)
CREATE POLICY "Authenticated users can view active party rooms"
  ON public.party_rooms
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. Allow authenticated users to view other users' profiles (needed for FK joins everywhere)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Fix agencies_public view — remove security_invoker so all users can see agency info
DROP VIEW IF EXISTS public.agencies_public;
CREATE VIEW public.agencies_public AS
SELECT 
    id,
    name,
    agency_code,
    logo_url,
    level,
    is_active,
    total_hosts,
    total_agents,
    owner_id,
    created_at
FROM agencies
WHERE is_active = true AND (is_blocked IS NOT TRUE);

GRANT SELECT ON public.agencies_public TO authenticated;
GRANT SELECT ON public.agencies_public TO anon;

-- 4. Check live_streams has a SELECT policy for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'live_streams' 
    AND cmd = 'SELECT' AND qual::text = 'true'
  ) THEN
    CREATE POLICY "Authenticated users can view live streams"
      ON public.live_streams FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

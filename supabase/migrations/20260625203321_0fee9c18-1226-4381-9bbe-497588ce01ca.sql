
-- Tighten admin_sections public read
DROP POLICY IF EXISTS "pkg419_admin_sections_read" ON public.admin_sections;
CREATE POLICY "admin_sections_read_authed_or_admin"
ON public.admin_sections
FOR SELECT
TO authenticated
USING (is_active_admin_session() OR is_active = true);

-- Tighten host_match_preferences public read
DROP POLICY IF EXISTS "hmp_read_all_basic" ON public.host_match_preferences;

CREATE POLICY "hmp_owner_read"
ON public.host_match_preferences
FOR SELECT
TO authenticated
USING (auth.uid() = host_id);

CREATE POLICY "hmp_admin_read"
ON public.host_match_preferences
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id = auth.uid() AND a.is_active = true));

-- Safe RPC for matchmaking UI: returns only non-sensitive pricing field
CREATE OR REPLACE FUNCTION public.get_host_match_rate(p_host_id uuid)
RETURNS TABLE(host_id uuid, coin_rate_per_min integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT host_id, coin_rate_per_min
  FROM public.host_match_preferences
  WHERE host_id = p_host_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_host_match_rate(uuid) TO anon, authenticated;

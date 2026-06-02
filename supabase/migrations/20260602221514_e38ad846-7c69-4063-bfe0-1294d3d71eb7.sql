
CREATE OR REPLACE FUNCTION public.get_public_landing_agencies(_country_code text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  agency_code text,
  logo_url text,
  total_hosts integer,
  country_code text,
  country_flag text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.name, a.agency_code, a.logo_url,
         COALESCE(a.total_hosts, 0)::int AS total_hosts,
         UPPER(COALESCE(p.country_code, ''))::text AS country_code,
         p.country_flag::text AS country_flag
  FROM public.agencies a
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  WHERE a.is_active = true
    AND a.is_blocked = false
    AND a.id NOT IN (
      'f6d74060-521b-4a66-8086-50d81043e127'::uuid, -- Official Admin
      'f3a69110-7894-46eb-a0fb-ff7d7d452ea6'::uuid  -- Bd Officials
    )
    AND (
      _country_code IS NULL
      OR _country_code = ''
      OR UPPER(p.country_code) = UPPER(_country_code)
    )
  ORDER BY a.total_hosts DESC NULLS LAST, a.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_public_landing_agencies(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_landing_agencies(text) TO anon, authenticated;

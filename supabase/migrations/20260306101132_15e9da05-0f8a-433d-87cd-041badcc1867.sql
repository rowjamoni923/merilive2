-- Fix agency code lookup to handle visually similar characters (0↔O, 1↔I↔L)
CREATE OR REPLACE FUNCTION public.get_agency_by_code(agency_code text)
RETURNS TABLE(id uuid, name text, level text, total_hosts integer)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- First try exact match
  RETURN QUERY
  SELECT a.id, a.name, a.level, a.total_hosts
  FROM public.agencies a
  WHERE upper(trim(a.agency_code)) = upper(trim(get_agency_by_code.agency_code))
    AND a.is_active = true
    AND (a.is_blocked IS NULL OR a.is_blocked = false)
  LIMIT 1;

  -- If no exact match found, try fuzzy match (0↔O, 1↔I↔L)
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT a.id, a.name, a.level, a.total_hosts
    FROM public.agencies a
    WHERE a.is_active = true
      AND (a.is_blocked IS NULL OR a.is_blocked = false)
      AND translate(upper(trim(a.agency_code)), 'OIL', '011') = translate(upper(trim(get_agency_by_code.agency_code)), 'OIL', '011')
    LIMIT 1;
  END IF;
END;
$$;
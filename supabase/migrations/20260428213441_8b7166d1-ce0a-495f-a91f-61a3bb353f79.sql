-- Pkg27.1: Remove hardcoded fallbacks, 100% admin-controlled
CREATE OR REPLACE FUNCTION public.get_rate_for_numeric_level(_level integer)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _rate numeric;
BEGIN
  SELECT commission_rate INTO _rate
    FROM agency_level_tiers
   WHERE display_order = GREATEST(1, LEAST(5, COALESCE(_level, 1)))
     AND is_active = true
   LIMIT 1;
  -- NO hardcoded fallback. Admin panel is the single source of truth.
  -- If tier is missing/inactive → returns NULL → commission = 0 (no payout).
  RETURN COALESCE(_rate, 0);
END;
$$;

COMMENT ON FUNCTION public.get_rate_for_numeric_level IS
'Pkg27.1: 100% admin-driven. Reads commission_rate from agency_level_tiers only. No hardcoded defaults.';
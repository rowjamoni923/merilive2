DROP VIEW IF EXISTS public.agencies_public CASCADE;
CREATE VIEW public.agencies_public
WITH (security_invoker = on) AS
SELECT
  id, name, agency_code, logo_url, level,
  total_hosts, total_agents, is_active,
  parent_agency_id, owner_id, created_at, diamond_balance
FROM public.agencies
WHERE COALESCE(is_active, true) = true;

GRANT SELECT ON public.agencies_public TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.host_weekly_contribution(_uid uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT COALESCE(weekly_earnings, 0)::bigint FROM public.profiles WHERE id = COALESCE(_uid, auth.uid()) LIMIT 1),
    0::bigint
  );
$$;

REVOKE ALL ON FUNCTION public.host_weekly_contribution(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.host_weekly_contribution(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.agency_weekly_total_income(_agency_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ap.total_income
      FROM public.agency_performance ap
      WHERE ap.agency_id = _agency_id
        AND ap.period_type = 'weekly'
        AND ap.period_start = date_trunc('week', (now() AT TIME ZONE 'utc')::date)::date
      LIMIT 1
    ),
    0::numeric
  );
$$;

REVOKE ALL ON FUNCTION public.agency_weekly_total_income(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agency_weekly_total_income(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_agency()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_id uuid := auth.uid();
  _agency_id uuid;
BEGIN
  IF _host_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT ah.agency_id INTO _agency_id
  FROM public.agency_hosts ah
  WHERE ah.host_id = _host_id
    AND ah.status = 'active'
  ORDER BY ah.joined_at DESC NULLS LAST
  LIMIT 1;

  IF _agency_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in an active agency');
  END IF;

  UPDATE public.agency_hosts
  SET status = 'left', left_at = now()
  WHERE host_id = _host_id AND status = 'active';

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET agency_id = NULL WHERE id = _host_id;

  UPDATE public.agencies
  SET total_hosts = GREATEST(COALESCE(total_hosts, 0) - 1, 0),
      updated_at = now()
  WHERE id = _agency_id;

  RETURN jsonb_build_object('success', true, 'agency_id', _agency_id);
END;
$$;

REVOKE ALL ON FUNCTION public.leave_agency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_agency() TO authenticated;
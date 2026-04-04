-- Drop and recreate the get_agency_rankings function with proper period handling
CREATE OR REPLACE FUNCTION public.get_agency_rankings(
  _ranking_type TEXT,
  _period_type TEXT,
  _limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  rank_position INTEGER,
  agency_id UUID,
  agency_name TEXT,
  agency_code TEXT,
  owner_avatar TEXT,
  country_code TEXT,
  country_flag TEXT,
  metric_value DECIMAL,
  total_hosts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  period_start_date DATE;
BEGIN
  -- Calculate period start based on period type
  IF _period_type = 'weekly' THEN
    period_start_date := date_trunc('week', CURRENT_DATE)::date;
  ELSE
    period_start_date := date_trunc('month', CURRENT_DATE)::date;
  END IF;

  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY 
      COALESCE(
        CASE _ranking_type
          WHEN 'golden_host_income' THEN ap.golden_host_income
          WHEN 'new_host' THEN ap.new_hosts_count::DECIMAL
          WHEN 'host_duration' THEN ap.total_host_hours
          ELSE ap.total_income
        END, 0
      ) DESC
    )::INTEGER as rank_position,
    a.id as agency_id,
    a.name as agency_name,
    a.agency_code,
    p.avatar_url as owner_avatar,
    p.country_code,
    p.country_flag,
    COALESCE(
      CASE _ranking_type
        WHEN 'golden_host_income' THEN ap.golden_host_income
        WHEN 'new_host' THEN ap.new_hosts_count::DECIMAL
        WHEN 'host_duration' THEN ap.total_host_hours
        ELSE ap.total_income
      END, 0
    ) as metric_value,
    COALESCE(a.total_hosts, 0)::INTEGER as total_hosts
  FROM public.agencies a
  LEFT JOIN public.agency_performance ap ON a.id = ap.agency_id 
    AND ap.period_type = _period_type
    AND ap.period_start = period_start_date
  LEFT JOIN public.profiles p ON a.owner_id = p.id
  WHERE a.is_active = true AND a.is_blocked = false
  ORDER BY metric_value DESC NULLS LAST
  LIMIT _limit;
END;
$$;

-- Enable realtime for agency_performance if not already
ALTER TABLE agency_performance REPLICA IDENTITY FULL;

-- Also create a simpler real-time ranking update trigger
CREATE OR REPLACE FUNCTION public.update_agency_ranking_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- This will notify listeners that rankings may have changed
  PERFORM pg_notify('agency_rankings_updated', json_build_object(
    'agency_id', COALESCE(NEW.agency_id, OLD.agency_id),
    'updated_at', now()
  )::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS trigger_agency_ranking_update ON agency_performance;
CREATE TRIGGER trigger_agency_ranking_update
AFTER INSERT OR UPDATE OR DELETE ON agency_performance
FOR EACH ROW EXECUTE FUNCTION update_agency_ranking_metrics();
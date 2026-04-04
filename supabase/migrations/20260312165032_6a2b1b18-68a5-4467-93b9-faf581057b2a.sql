
-- RPC: Get daily analytics data for charts (real data, not mock)
CREATE OR REPLACE FUNCTION public.get_admin_analytics_chart_data(p_days integer DEFAULT 7)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date := CURRENT_DATE - p_days;
  v_result json;
BEGIN
  SELECT json_build_object(
    'user_growth', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
      FROM (
        SELECT 
          d::date AS date,
          COALESCE((SELECT count(*) FROM profiles WHERE created_at::date = d::date), 0) AS new_users,
          COALESCE((SELECT count(*) FROM profiles WHERE created_at::date = d::date AND is_host = true), 0) AS new_hosts,
          COALESCE((SELECT count(*) FROM profiles WHERE created_at::date <= d::date), 0) AS total_users
        FROM generate_series(v_start_date, CURRENT_DATE, '1 day'::interval) d
      ) t
    ),
    'gift_revenue', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
      FROM (
        SELECT 
          d::date AS date,
          COALESCE((SELECT sum(coin_amount) FROM gift_transactions WHERE created_at::date = d::date), 0) AS coins,
          COALESCE((SELECT count(*) FROM gift_transactions WHERE created_at::date = d::date), 0) AS transactions
        FROM generate_series(v_start_date, CURRENT_DATE, '1 day'::interval) d
      ) t
    ),
    'call_activity', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
      FROM (
        SELECT 
          d::date AS date,
          COALESCE((SELECT count(*) FROM private_calls WHERE created_at::date = d::date), 0) AS calls,
          COALESCE((SELECT sum(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - created_at)) / 60) FROM private_calls WHERE created_at::date = d::date AND status = 'completed'), 0)::integer AS total_minutes
        FROM generate_series(v_start_date, CURRENT_DATE, '1 day'::interval) d
      ) t
    ),
    'recharge_revenue', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
      FROM (
        SELECT 
          d::date AS date,
          COALESCE((SELECT sum(amount) FROM recharge_transactions WHERE created_at::date = d::date AND status = 'completed'), 0) AS revenue,
          COALESCE((SELECT count(*) FROM recharge_transactions WHERE created_at::date = d::date AND status = 'completed'), 0) AS count
        FROM generate_series(v_start_date, CURRENT_DATE, '1 day'::interval) d
      ) t
    ),
    'agency_distribution', (
      SELECT json_build_object(
        'active', (SELECT count(*) FROM agencies WHERE is_active = true AND is_blocked = false),
        'inactive', (SELECT count(*) FROM agencies WHERE is_active = false AND is_blocked = false),
        'blocked', (SELECT count(*) FROM agencies WHERE is_blocked = true)
      )
    ),
    'summary', json_build_object(
      'total_revenue_period', COALESCE((SELECT sum(amount) FROM recharge_transactions WHERE created_at::date >= v_start_date AND status = 'completed'), 0),
      'total_gifts_period', COALESCE((SELECT sum(coin_amount) FROM gift_transactions WHERE created_at::date >= v_start_date), 0),
      'total_calls_period', (SELECT count(*) FROM private_calls WHERE created_at::date >= v_start_date),
      'total_new_users_period', (SELECT count(*) FROM profiles WHERE created_at::date >= v_start_date),
      'total_new_hosts_period', (SELECT count(*) FROM profiles WHERE created_at::date >= v_start_date AND is_host = true)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

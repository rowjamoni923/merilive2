CREATE OR REPLACE FUNCTION public.get_admin_analytics_chart_data(p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start_date date := (CURRENT_DATE - (p_days - 1));
  v_user_growth jsonb;
  v_gift_revenue jsonb;
  v_call_activity jsonb;
  v_recharge_revenue jsonb;
  v_agency_distribution jsonb;
  v_summary jsonb;
BEGIN
  IF NOT (is_active_admin_session() OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  WITH days AS (
    SELECT generate_series(v_start_date, CURRENT_DATE, '1 day'::interval)::date AS d
  ),
  user_counts AS (
    SELECT created_at::date AS d,
           COUNT(*) FILTER (WHERE COALESCE(is_host,false) = false) AS new_users,
           COUNT(*) FILTER (WHERE COALESCE(is_host,false) = true)  AS new_hosts
    FROM profiles
    WHERE created_at::date >= v_start_date
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(days.d, 'YYYY-MM-DD'),
    'new_users', COALESCE(uc.new_users, 0),
    'new_hosts', COALESCE(uc.new_hosts, 0),
    'total_users', COALESCE(uc.new_users, 0) + COALESCE(uc.new_hosts, 0)
  ) ORDER BY days.d) INTO v_user_growth
  FROM days LEFT JOIN user_counts uc ON uc.d = days.d;

  WITH days AS (
    SELECT generate_series(v_start_date, CURRENT_DATE, '1 day'::interval)::date AS d
  ),
  gift_counts AS (
    SELECT created_at::date AS d,
           COALESCE(SUM(COALESCE(coin_cost, coin_amount, 0)), 0) AS coins,
           COUNT(*) AS transactions
    FROM gift_transactions
    WHERE created_at::date >= v_start_date
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(days.d, 'YYYY-MM-DD'),
    'coins', COALESCE(gc.coins, 0),
    'transactions', COALESCE(gc.transactions, 0)
  ) ORDER BY days.d) INTO v_gift_revenue
  FROM days LEFT JOIN gift_counts gc ON gc.d = days.d;

  WITH days AS (
    SELECT generate_series(v_start_date, CURRENT_DATE, '1 day'::interval)::date AS d
  ),
  call_counts AS (
    SELECT created_at::date AS d,
           COUNT(*) AS calls,
           COALESCE(SUM(duration_seconds), 0) / 60 AS total_minutes
    FROM private_calls
    WHERE created_at::date >= v_start_date
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(days.d, 'YYYY-MM-DD'),
    'calls', COALESCE(cc.calls, 0),
    'total_minutes', COALESCE(cc.total_minutes, 0)
  ) ORDER BY days.d) INTO v_call_activity
  FROM days LEFT JOIN call_counts cc ON cc.d = days.d;

  WITH days AS (
    SELECT generate_series(v_start_date, CURRENT_DATE, '1 day'::interval)::date AS d
  ),
  recharge_counts AS (
    SELECT created_at::date AS d,
           COALESCE(SUM(amount), 0) AS revenue,
           COUNT(*) AS count
    FROM recharge_transactions
    WHERE created_at::date >= v_start_date
      AND status IN ('completed','success','paid','approved')
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(days.d, 'YYYY-MM-DD'),
    'revenue', COALESCE(rc.revenue, 0),
    'count', COALESCE(rc.count, 0)
  ) ORDER BY days.d) INTO v_recharge_revenue
  FROM days LEFT JOIN recharge_counts rc ON rc.d = days.d;

  SELECT jsonb_build_object(
    'active',   COUNT(*) FILTER (WHERE COALESCE(is_active,false) = true  AND COALESCE(is_blocked,false) = false),
    'inactive', COUNT(*) FILTER (WHERE COALESCE(is_active,false) = false AND COALESCE(is_blocked,false) = false),
    'blocked',  COUNT(*) FILTER (WHERE COALESCE(is_blocked,false) = true)
  ) INTO v_agency_distribution
  FROM agencies;

  SELECT jsonb_build_object(
    'total_revenue_period',
      (SELECT COALESCE(SUM(amount),0) FROM recharge_transactions
        WHERE created_at::date >= v_start_date AND status IN ('completed','success','paid','approved')),
    'total_gifts_period',
      (SELECT COALESCE(SUM(COALESCE(coin_cost, coin_amount, 0)),0) FROM gift_transactions
        WHERE created_at::date >= v_start_date),
    'total_calls_period',
      (SELECT COUNT(*) FROM private_calls WHERE created_at::date >= v_start_date),
    'total_new_users_period',
      (SELECT COUNT(*) FROM profiles WHERE created_at::date >= v_start_date AND COALESCE(is_host,false) = false),
    'total_new_hosts_period',
      (SELECT COUNT(*) FROM profiles WHERE created_at::date >= v_start_date AND COALESCE(is_host,false) = true)
  ) INTO v_summary;

  RETURN jsonb_build_object(
    'user_growth', COALESCE(v_user_growth, '[]'::jsonb),
    'gift_revenue', COALESCE(v_gift_revenue, '[]'::jsonb),
    'call_activity', COALESCE(v_call_activity, '[]'::jsonb),
    'recharge_revenue', COALESCE(v_recharge_revenue, '[]'::jsonb),
    'agency_distribution', COALESCE(v_agency_distribution, '{}'::jsonb),
    'summary', COALESCE(v_summary, '{}'::jsonb),
    'period_days', p_days,
    'start_date', to_char(v_start_date, 'YYYY-MM-DD'),
    'end_date', to_char(CURRENT_DATE, 'YYYY-MM-DD')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.compute_sales_by_source(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  source_key TEXT,
  display_name TEXT,
  gross_usd NUMERIC,
  transaction_count BIGINT,
  unique_buyers BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  RETURN QUERY
  -- Official Play Store / direct recharge
  SELECT 'official_recharge'::text, 'Official (Play Store / Direct)'::text,
         ROUND(COALESCE(SUM(usd_amount),0)::numeric, 4),
         COUNT(*)::bigint,
         COUNT(DISTINCT user_id)::bigint
  FROM public.recharge_transactions
  WHERE status IN ('completed','approved')
    AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  -- Helper sales split by helper level
  SELECT
    'helper_level_' || COALESCE(th.trader_level::text, '0') AS source_key,
    'Helper L' || COALESCE(th.trader_level::text, '0') || ' Sales' AS display_name,
    ROUND(COALESCE(SUM(COALESCE(ho.amount_usd, ho.total_price_usd, 0)),0)::numeric, 4),
    COUNT(*)::bigint,
    COUNT(DISTINCT ho.customer_id)::bigint
  FROM public.helper_orders ho
  LEFT JOIN public.topup_helpers th ON th.id = ho.helper_id
  WHERE ho.status IN ('completed','approved','delivered')
    AND COALESCE(ho.processed_at, ho.created_at) BETWEEN p_start AND p_end
  GROUP BY th.trader_level;
END $$;

REVOKE ALL ON FUNCTION public.compute_sales_by_source(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_sales_by_source(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

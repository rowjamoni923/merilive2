-- ============================================================
-- Profit Analytics — Daily Sales + Profit (A-to-Z per day)
-- Extends compute_profit_timeline to return full financials per day.
-- ============================================================

DROP FUNCTION IF EXISTS public.compute_profit_timeline(TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.compute_profit_timeline(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  day DATE,
  sector_key TEXT,
  gross_revenue_usd NUMERIC,
  company_cut_usd NUMERIC,
  payouts_usd NUMERIC,
  gateway_cost_usd NUMERIC,
  net_profit_usd NUMERIC,
  transaction_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d DATE;
  rec RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  FOR d IN
    SELECT generate_series(p_start::date, p_end::date, '1 day'::interval)::date
  LOOP
    FOR rec IN
      SELECT * FROM public.compute_profit_for_range(d::timestamptz, (d + 1)::timestamptz)
    LOOP
      day := d;
      sector_key := rec.sector_key;
      gross_revenue_usd := rec.gross_revenue_usd;
      company_cut_usd := rec.company_cut_usd;
      payouts_usd := rec.payouts_usd;
      gateway_cost_usd := rec.gateway_cost_usd;
      net_profit_usd := rec.net_profit_usd;
      transaction_count := rec.transaction_count;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.compute_profit_timeline(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_profit_timeline(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;
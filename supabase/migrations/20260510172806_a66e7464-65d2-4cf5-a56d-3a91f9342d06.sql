CREATE OR REPLACE FUNCTION public.admin_payroll_orders_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_today_start timestamptz := date_trunc('day', now());
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH ho AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status = 'pending') AS pending,
      count(*) FILTER (WHERE status = 'processing') AS processing,
      count(*) FILTER (WHERE status = 'completed') AS completed,
      count(*) FILTER (WHERE status IN ('cancelled','failed')) AS cancelled,
      coalesce(sum(total_price_usd) FILTER (WHERE created_at >= v_today_start), 0) AS today_helper_usd
    FROM public.helper_orders
  ),
  aw AS (
    SELECT
      count(*) FILTER (WHERE status = 'processing') AS processing,
      count(*) FILTER (WHERE status = 'approved') AS approved,
      count(*) FILTER (WHERE status = 'rejected') AS rejected,
      coalesce(sum(usd_amount) FILTER (WHERE requested_at >= v_today_start), 0) AS today_aw_usd
    FROM public.agency_withdrawals
  )
  SELECT jsonb_build_object(
    'total', ho.total + aw.processing + aw.approved + aw.rejected,
    'pending', ho.pending,
    'processing', ho.processing + aw.processing,
    'completed', ho.completed + aw.approved,
    'cancelled', ho.cancelled + aw.rejected,
    'todayTotal', ho.today_helper_usd + aw.today_aw_usd
  )
  INTO v_result
  FROM ho, aw;

  RETURN v_result;
END;
$function$;
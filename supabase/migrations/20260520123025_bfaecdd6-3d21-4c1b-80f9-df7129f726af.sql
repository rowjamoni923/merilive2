-- ============================================================
-- get_helper_daily_topup_stats: per-helper "today" completed
-- manual top-up count (Asia/Dhaka day boundary, BST).
-- Used by Recharge.tsx Verified Trader cards.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_helper_daily_topup_stats(_helper_ids uuid[])
RETURNS TABLE(helper_id uuid, daily_count integer, daily_diamonds bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    ho.helper_id,
    COUNT(*)::integer                                                   AS daily_count,
    COALESCE(SUM(COALESCE(ho.coin_amount, ho.diamond_amount, 0)), 0)::bigint AS daily_diamonds
  FROM public.helper_orders ho
  WHERE ho.helper_id = ANY(_helper_ids)
    AND ho.status = 'completed'
    AND (ho.created_at AT TIME ZONE 'Asia/Dhaka')::date
        = (now()         AT TIME ZONE 'Asia/Dhaka')::date
  GROUP BY ho.helper_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_helper_daily_topup_stats(uuid[]) TO authenticated, anon;
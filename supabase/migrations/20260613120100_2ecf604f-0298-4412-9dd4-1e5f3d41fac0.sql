CREATE OR REPLACE FUNCTION public.compute_helper_diamond_payouts(p_start timestamp with time zone, p_end timestamp with time zone, p_limit integer DEFAULT 200)
 RETURNS TABLE(helper_id uuid, helper_name text, diamonds_topped_up numeric, usd_withdrawn numeric, diamond_withdrawal_reward numeric, commission_usd numeric, topup_count bigint, withdrawal_count bigint, order_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_request() THEN RAISE EXCEPTION 'Forbidden: admin role required'; END IF;
  RETURN QUERY
  WITH topups AS (
    SELECT htr.helper_id AS hid, COALESCE(SUM(htr.coin_amount),0)::numeric AS diamonds, COUNT(*)::bigint AS cnt
    FROM public.helper_topup_requests htr
    WHERE htr.status IN ('completed','approved') AND COALESCE(htr.processed_at, htr.created_at) BETWEEN p_start AND p_end
    GROUP BY htr.helper_id
  ),
  withdrawals AS (
    SELECT hwr.helper_id AS hid, COALESCE(SUM(COALESCE(hwr.helper_net_reward, hwr.usd_amount, hwr.amount)),0)::numeric AS usd,
           COALESCE(SUM(COALESCE(hwr.diamond_reward,0)),0)::numeric AS dia, COUNT(*)::bigint AS cnt
    FROM public.helper_withdrawal_requests hwr
    WHERE hwr.status IN ('completed','approved','paid') AND COALESCE(hwr.processed_at, hwr.created_at) BETWEEN p_start AND p_end
    GROUP BY hwr.helper_id
  ),
  commissions AS (
    SELECT ho.helper_id AS hid, COALESCE(SUM(ho.commission_amount),0)::numeric AS usd, COUNT(*)::bigint AS cnt
    FROM public.helper_orders ho
    WHERE ho.status IN ('completed','approved','delivered') AND COALESCE(ho.processed_at, ho.created_at) BETWEEN p_start AND p_end
    GROUP BY ho.helper_id
  ),
  all_hids AS (SELECT hid FROM topups UNION SELECT hid FROM withdrawals UNION SELECT hid FROM commissions)
  SELECT a.hid, COALESCE(p.full_name, p.username, a.hid::text),
         COALESCE(t.diamonds, 0), COALESCE(w.usd, 0), COALESCE(w.dia, 0),
         COALESCE(c.usd, 0), COALESCE(t.cnt, 0), COALESCE(w.cnt, 0), COALESCE(c.cnt, 0)
  FROM all_hids a
  LEFT JOIN topups t ON t.hid = a.hid
  LEFT JOIN withdrawals w ON w.hid = a.hid
  LEFT JOIN commissions c ON c.hid = a.hid
  LEFT JOIN public.profiles p ON p.id = a.hid
  ORDER BY (COALESCE(t.diamonds,0) + COALESCE(w.dia,0)) DESC, COALESCE(w.usd,0) DESC
  LIMIT p_limit;
END $function$;
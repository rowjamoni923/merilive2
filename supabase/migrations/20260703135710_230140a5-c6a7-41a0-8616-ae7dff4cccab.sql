CREATE OR REPLACE FUNCTION public.compute_helper_diamond_payouts(
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_limit integer DEFAULT 200
)
RETURNS TABLE(
  helper_id uuid,
  helper_name text,
  diamonds_topped_up numeric,
  usd_withdrawn numeric,
  diamond_withdrawal_reward numeric,
  commission_usd numeric,
  topup_count bigint,
  withdrawal_count bigint,
  order_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_request() THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  RETURN QUERY
  WITH topups AS (
    SELECT
      htr.helper_id AS hid,
      COALESCE(SUM(htr.coin_amount), 0)::numeric AS diamonds,
      COUNT(*)::bigint AS cnt
    FROM public.helper_topup_requests htr
    WHERE htr.status IN ('completed', 'approved')
      AND COALESCE(htr.processed_at, htr.created_at) BETWEEN p_start AND p_end
    GROUP BY htr.helper_id
  ),
  withdrawals AS (
    SELECT
      hwr.helper_id AS hid,
      COALESCE(SUM(COALESCE(hwr.helper_net_reward, hwr.usd_amount, hwr.amount)), 0)::numeric AS usd,
      COALESCE(SUM(COALESCE(hwr.diamond_reward, 0)), 0)::numeric AS dia,
      COUNT(*)::bigint AS cnt
    FROM public.helper_withdrawal_requests hwr
    WHERE hwr.status IN ('completed', 'approved', 'paid')
      AND COALESCE(hwr.processed_at, hwr.created_at) BETWEEN p_start AND p_end
    GROUP BY hwr.helper_id
  ),
  commissions AS (
    SELECT
      ho.helper_id AS hid,
      COALESCE(SUM(ho.commission_amount), 0)::numeric AS usd,
      COUNT(*)::bigint AS cnt
    FROM public.helper_orders ho
    WHERE ho.status IN ('completed', 'approved', 'delivered')
      AND COALESCE(ho.processed_at, ho.created_at) BETWEEN p_start AND p_end
    GROUP BY ho.helper_id
  ),
  all_hids AS (
    SELECT hid FROM topups
    UNION
    SELECT hid FROM withdrawals
    UNION
    SELECT hid FROM commissions
  )
  SELECT
    a.hid,
    COALESCE(NULLIF(p.display_name, ''), NULLIF(p.username, ''), a.hid::text) AS helper_name,
    COALESCE(t.diamonds, 0),
    COALESCE(w.usd, 0),
    COALESCE(w.dia, 0),
    COALESCE(c.usd, 0),
    COALESCE(t.cnt, 0),
    COALESCE(w.cnt, 0),
    COALESCE(c.cnt, 0)
  FROM all_hids a
  LEFT JOIN topups t ON t.hid = a.hid
  LEFT JOIN withdrawals w ON w.hid = a.hid
  LEFT JOIN commissions c ON c.hid = a.hid
  LEFT JOIN public.profiles p ON p.id = a.hid
  ORDER BY (COALESCE(t.diamonds, 0) + COALESCE(w.dia, 0)) DESC, COALESCE(w.usd, 0) DESC
  LIMIT GREATEST(COALESCE(p_limit, 200), 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_helper_diamond_payouts(timestamp with time zone, timestamp with time zone, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_helper_diamond_payouts(timestamp with time zone, timestamp with time zone, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_helper_diamond_payouts(timestamp with time zone, timestamp with time zone, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.search_group_members(
  p_group_id uuid,
  p_q text DEFAULT NULL::text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  user_id uuid,
  role text,
  joined_at timestamp with time zone,
  full_name text,
  username text,
  avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm_check
    WHERE gm_check.group_id = p_group_id
      AND gm_check.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  RETURN QUERY
  SELECT
    gm.user_id,
    gm.role,
    gm.joined_at,
    COALESCE(NULLIF(p.display_name, ''), NULLIF(p.username, '')) AS full_name,
    p.username,
    p.avatar_url
  FROM public.group_members gm
  LEFT JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND (
      p_q IS NULL
      OR p.display_name ILIKE '%' || p_q || '%'
      OR p.username ILIKE '%' || p_q || '%'
    )
  ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, gm.joined_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.search_group_members(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_group_members(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_group_members(uuid, text, integer) TO service_role;
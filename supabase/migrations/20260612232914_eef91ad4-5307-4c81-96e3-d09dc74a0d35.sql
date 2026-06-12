
-- ============================================================
-- Fix Gift sector column + add Payouts analytics
-- ============================================================

-- 1) Rebuild compute_profit_for_range with corrected gift columns
CREATE OR REPLACE FUNCTION public.compute_profit_for_range(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  sector_key TEXT,
  display_name TEXT,
  gross_revenue_usd NUMERIC,
  company_cut_usd NUMERIC,
  payouts_usd NUMERIC,
  gateway_cost_usd NUMERIC,
  net_profit_usd NUMERIC,
  transaction_count BIGINT,
  company_cut_percent NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_coin_rate NUMERIC;
  v_bean_rate NUMERIC;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  v_coin_rate := public.get_official_coin_usd_rate();
  v_bean_rate := v_coin_rate; -- beans valued at same official rate

  RETURN QUERY
  WITH cfg AS (SELECT * FROM public.profit_config WHERE is_active),
  s_recharge AS (
    SELECT 'recharge'::text AS k,
           COALESCE(SUM(usd_amount),0)::numeric AS gross,
           COUNT(*)::bigint AS cnt
    FROM public.recharge_transactions
    WHERE status IN ('completed','approved') AND COALESCE(processed_at,created_at) BETWEEN p_start AND p_end
  ),
  s_helper AS (
    SELECT 'helper_order'::text AS k,
           COALESCE(SUM(COALESCE(amount_usd,total_price_usd,0)),0)::numeric AS gross,
           COALESCE(SUM(COALESCE(commission_amount,0)),0)::numeric AS commission,
           COUNT(*)::bigint AS cnt
    FROM public.helper_orders
    WHERE status IN ('completed','approved','delivered') AND COALESCE(processed_at,created_at) BETWEEN p_start AND p_end
  ),
  -- gifts: use total_coins or coin_cost * quantity (real column names)
  s_gift AS (
    SELECT 'gift'::text AS k,
           COALESCE(SUM(
             COALESCE(total_coins,
                      coin_cost * COALESCE(quantity,1),
                      coin_amount * COALESCE(quantity,1),
                      0)
           ),0)::numeric AS gross_coins,
           COALESCE(SUM(COALESCE(receiver_beans,0)),0)::numeric AS payout_beans,
           COUNT(*)::bigint AS cnt
    FROM public.gift_transactions
    WHERE created_at BETWEEN p_start AND p_end
  ),
  s_call AS (
    SELECT 'private_call'::text AS k,
           COALESCE(SUM(COALESCE(total_coins_deducted, coins_spent, 0)),0)::numeric AS gross_coins,
           COALESCE(SUM(COALESCE(host_earned, host_earnings_amount, 0)),0)::numeric AS payout_coins,
           COUNT(*)::bigint AS cnt
    FROM public.private_calls
    WHERE COALESCE(ended_at, created_at) BETWEEN p_start AND p_end
      AND status IN ('ended','completed','settled')
  ),
  s_agency AS (
    SELECT 'agency_withdrawal_fee'::text AS k,
           COALESCE(SUM(COALESCE(usd_amount, amount)),0)::numeric AS gross_usd,
           COALESCE(SUM(
             COALESCE(usd_amount, amount) * COALESCE(fee_percentage,0)/100.0
           ),0)::numeric AS fee_usd,
           COUNT(*)::bigint AS cnt
    FROM public.agency_withdrawals
    WHERE status IN ('completed','approved','paid')
      AND COALESCE(processed_at, requested_at) BETWEEN p_start AND p_end
  ),
  s_exchange AS (
    SELECT 'exchange'::text AS k,
           COALESCE(SUM(beans_amount),0)::numeric AS gross_beans,
           COALESCE(SUM(diamonds_reward),0)::numeric AS payout_coins,
           COUNT(*)::bigint AS cnt
    FROM public.user_beans_exchanges
    WHERE status IN ('completed','approved') AND COALESCE(completed_at,created_at) BETWEEN p_start AND p_end
  ),
  s_game AS (
    SELECT 'game'::text AS k,
           COALESCE(SUM(COALESCE(bet_amount,0)),0)::numeric AS bets,
           COALESCE(SUM(COALESCE(win_amount,0)),0)::numeric AS wins,
           COUNT(*)::bigint AS cnt
    FROM public.game_transactions
    WHERE created_at BETWEEN p_start AND p_end
  ),
  s_vip AS (
    SELECT 'vip_subscription'::text AS k,
           COALESCE(SUM(COALESCE(amount_paid,0)),0)::numeric AS gross_usd,
           COUNT(*)::bigint AS cnt
    FROM public.user_vip_subscriptions WHERE created_at BETWEEN p_start AND p_end
  ),
  s_noble AS (
    SELECT 'noble_subscription'::text AS k,
           COALESCE(SUM(COALESCE(diamonds_spent,0)),0)::numeric AS gross_coins,
           COUNT(*)::bigint AS cnt
    FROM public.user_noble_subscriptions WHERE created_at BETWEEN p_start AND p_end
  ),
  s_sub AS (
    SELECT 'subscription_order'::text AS k,
           COALESCE(SUM(COALESCE(amount,0)),0)::numeric AS gross_usd,
           COUNT(*)::bigint AS cnt
    FROM public.subscription_orders
    WHERE status IN ('completed','approved','paid') AND created_at BETWEEN p_start AND p_end
  ),
  s_shop AS (
    SELECT 'shop_purchase'::text AS k,
           COALESCE(SUM(CASE WHEN currency_type IN ('coin','coins','diamond','diamonds') THEN COALESCE(price_paid,0) ELSE 0 END),0)::numeric AS gross_coins,
           COUNT(*)::bigint AS cnt
    FROM public.user_purchases WHERE purchased_at BETWEEN p_start AND p_end
  ),
  s_party AS (
    SELECT 'party_room'::text AS k, 0::numeric AS gross,
      (SELECT COUNT(*)::bigint FROM public.party_room_messages WHERE created_at BETWEEN p_start AND p_end AND message_type='gift') AS cnt
  ),
  s_pk AS (
    SELECT 'pk_battle'::text AS k,
      COALESCE(SUM(COALESCE(total_gift_value,0)),0)::numeric AS gross_coins,
      COUNT(*)::bigint AS cnt
    FROM public.pk_battles WHERE COALESCE(ended_at,created_at) BETWEEN p_start AND p_end AND status IN ('ended','completed')
  ),
  s_lucky AS (
    SELECT 'lucky_gift'::text AS k,
      COALESCE(SUM(COALESCE(diamonds_won,0)),0)::numeric AS payout_coins,
      COUNT(*)::bigint AS cnt
    FROM public.lucky_gift_results WHERE created_at BETWEEN p_start AND p_end
  ),
  agg AS (
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_recharge.gross AS gross_usd,
      s_recharge.gross * (c.gateway_cost_percent/100.0) AS gateway_cost,
      0::numeric AS payouts, s_recharge.cnt AS cnt
    FROM cfg c JOIN s_recharge ON c.sector_key=s_recharge.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_helper.gross, 0::numeric, s_helper.commission, s_helper.cnt
    FROM cfg c JOIN s_helper ON c.sector_key=s_helper.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_gift.gross_coins * v_coin_rate, 0::numeric, s_gift.payout_beans * v_bean_rate, s_gift.cnt
    FROM cfg c JOIN s_gift ON c.sector_key=s_gift.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_call.gross_coins * v_coin_rate, 0::numeric, s_call.payout_coins * v_coin_rate, s_call.cnt
    FROM cfg c JOIN s_call ON c.sector_key=s_call.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_agency.fee_usd, 0::numeric, 0::numeric, s_agency.cnt
    FROM cfg c JOIN s_agency ON c.sector_key=s_agency.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      (s_exchange.gross_beans * v_bean_rate), 0::numeric, (s_exchange.payout_coins * v_coin_rate), s_exchange.cnt
    FROM cfg c JOIN s_exchange ON c.sector_key=s_exchange.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_game.bets * v_coin_rate, 0::numeric, s_game.wins * v_coin_rate, s_game.cnt
    FROM cfg c JOIN s_game ON c.sector_key=s_game.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, s_vip.gross_usd, s_vip.gross_usd*(c.gateway_cost_percent/100.0), 0::numeric, s_vip.cnt
    FROM cfg c JOIN s_vip ON c.sector_key=s_vip.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, s_noble.gross_coins*v_coin_rate, 0::numeric, 0::numeric, s_noble.cnt
    FROM cfg c JOIN s_noble ON c.sector_key=s_noble.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, s_sub.gross_usd, s_sub.gross_usd*(c.gateway_cost_percent/100.0), 0::numeric, s_sub.cnt
    FROM cfg c JOIN s_sub ON c.sector_key=s_sub.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, s_shop.gross_coins*v_coin_rate, 0::numeric, 0::numeric, s_shop.cnt
    FROM cfg c JOIN s_shop ON c.sector_key=s_shop.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, 0::numeric, 0::numeric, 0::numeric, s_party.cnt FROM cfg c JOIN s_party ON c.sector_key=s_party.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, 0::numeric, 0::numeric, 0::numeric, s_pk.cnt FROM cfg c JOIN s_pk ON c.sector_key=s_pk.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, 0::numeric, 0::numeric, 0::numeric, s_lucky.cnt FROM cfg c JOIN s_lucky ON c.sector_key=s_lucky.k
  )
  SELECT
    agg.sector_key, agg.display_name,
    ROUND(agg.gross_usd, 4),
    ROUND(CASE
      WHEN agg.sector_key IN ('gift','private_call','exchange','game') THEN GREATEST(agg.gross_usd - agg.payouts, 0)
      WHEN agg.sector_key = 'agency_withdrawal_fee' THEN agg.gross_usd
      ELSE agg.gross_usd * (agg.company_cut_percent/100.0)
    END, 4) AS company_cut_usd,
    ROUND(agg.payouts, 4),
    ROUND(agg.gateway_cost, 4),
    ROUND(
      CASE
        WHEN agg.sector_key IN ('gift','private_call','exchange','game') THEN GREATEST(agg.gross_usd - agg.payouts, 0)
        WHEN agg.sector_key = 'agency_withdrawal_fee' THEN agg.gross_usd
        ELSE agg.gross_usd * (agg.company_cut_percent/100.0)
      END - agg.gateway_cost
    , 4) AS net_profit_usd,
    agg.cnt, agg.company_cut_percent
  FROM agg
  ORDER BY net_profit_usd DESC NULLS LAST;
END $$;

REVOKE ALL ON FUNCTION public.compute_profit_for_range(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_profit_for_range(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

-- 2) NEW: compute_payouts_for_range — full money + diamond outflow analytics
CREATE OR REPLACE FUNCTION public.compute_payouts_for_range(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  category_key TEXT,
  display_name TEXT,
  payout_usd NUMERIC,
  payout_diamonds NUMERIC,
  transaction_count BIGINT,
  recipient_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_coin_rate NUMERIC;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  v_coin_rate := public.get_official_coin_usd_rate();

  RETURN QUERY
  -- Agency withdrawals (money out to agencies)
  SELECT 'agency_withdrawal'::text, 'Agency Withdrawals'::text,
         ROUND(COALESCE(SUM(COALESCE(net_amount_money, usd_amount, amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(net_diamonds_to_helper,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT agency_id)::bigint
  FROM public.agency_withdrawals
  WHERE status IN ('completed','approved','paid')
    AND COALESCE(processed_at, requested_at) BETWEEN p_start AND p_end
  UNION ALL
  -- Helper withdrawals (money out to helpers)
  SELECT 'helper_withdrawal', 'Helper Withdrawals',
         ROUND(COALESCE(SUM(COALESCE(helper_net_reward, usd_amount, amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(diamond_reward,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT helper_id)::bigint
  FROM public.helper_withdrawal_requests
  WHERE status IN ('completed','approved','paid')
    AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  -- Helper top-ups (diamonds GIVEN to helpers as inventory)
  SELECT 'helper_topup', 'Helper Diamond Top-ups',
         ROUND(COALESCE(SUM(COALESCE(amount_usd, amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(coin_amount,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT helper_id)::bigint
  FROM public.helper_topup_requests
  WHERE status IN ('completed','approved')
    AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  -- Helper order commissions (USD paid to helpers per order)
  SELECT 'helper_commission', 'Helper Order Commissions',
         ROUND(COALESCE(SUM(COALESCE(commission_amount,0)),0)::numeric, 4),
         0::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT helper_id)::bigint
  FROM public.helper_orders
  WHERE status IN ('completed','approved','delivered')
    AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  -- Host payroll requests (beans → USD)
  SELECT 'host_payroll', 'Host Payroll Payouts',
         ROUND(COALESCE(SUM(COALESCE(usd_amount,0)),0)::numeric, 4),
         0::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT user_id)::bigint
  FROM public.payroll_requests
  WHERE status IN ('completed','approved','paid')
    AND COALESCE(reviewed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  -- Agency → Host earnings transfers
  SELECT 'agency_host_transfer', 'Agency → Host Earnings',
         ROUND(COALESCE(SUM(amount),0)::numeric, 4),
         0::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT host_id)::bigint
  FROM public.agency_earnings_transfers
  WHERE COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  -- Beans → Diamond exchange (diamonds given to users)
  SELECT 'beans_exchange', 'Beans → Diamonds Reward',
         ROUND((COALESCE(SUM(diamonds_reward),0) * v_coin_rate)::numeric, 4),
         COALESCE(SUM(diamonds_reward),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT user_id)::bigint
  FROM public.user_beans_exchanges
  WHERE status IN ('completed','approved')
    AND COALESCE(completed_at, created_at) BETWEEN p_start AND p_end;
END $$;

REVOKE ALL ON FUNCTION public.compute_payouts_for_range(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_payouts_for_range(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

-- 3) Daily payouts timeline
CREATE OR REPLACE FUNCTION public.compute_payouts_timeline(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (
  day DATE,
  category_key TEXT,
  payout_usd NUMERIC,
  payout_diamonds NUMERIC,
  transaction_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d DATE; rec RECORD;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  FOR d IN SELECT generate_series(p_start::date, p_end::date, '1 day'::interval)::date LOOP
    FOR rec IN SELECT * FROM public.compute_payouts_for_range(d::timestamptz, (d+1)::timestamptz) LOOP
      day := d; category_key := rec.category_key;
      payout_usd := rec.payout_usd; payout_diamonds := rec.payout_diamonds;
      transaction_count := rec.transaction_count;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.compute_payouts_timeline(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_payouts_timeline(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

-- 4) Per-helper diamond payout breakdown
CREATE OR REPLACE FUNCTION public.compute_helper_diamond_payouts(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ,
  p_limit INT DEFAULT 200
)
RETURNS TABLE (
  helper_id UUID,
  helper_name TEXT,
  diamonds_topped_up NUMERIC,
  usd_withdrawn NUMERIC,
  diamond_withdrawal_reward NUMERIC,
  commission_usd NUMERIC,
  topup_count BIGINT,
  withdrawal_count BIGINT,
  order_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  RETURN QUERY
  WITH topups AS (
    SELECT helper_id AS hid,
           COALESCE(SUM(coin_amount),0)::numeric AS diamonds,
           COUNT(*)::bigint AS cnt
    FROM public.helper_topup_requests
    WHERE status IN ('completed','approved')
      AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
    GROUP BY helper_id
  ),
  withdrawals AS (
    SELECT helper_id AS hid,
           COALESCE(SUM(COALESCE(helper_net_reward, usd_amount, amount)),0)::numeric AS usd,
           COALESCE(SUM(COALESCE(diamond_reward,0)),0)::numeric AS dia,
           COUNT(*)::bigint AS cnt
    FROM public.helper_withdrawal_requests
    WHERE status IN ('completed','approved','paid')
      AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
    GROUP BY helper_id
  ),
  commissions AS (
    SELECT helper_id AS hid,
           COALESCE(SUM(commission_amount),0)::numeric AS usd,
           COUNT(*)::bigint AS cnt
    FROM public.helper_orders
    WHERE status IN ('completed','approved','delivered')
      AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
    GROUP BY helper_id
  ),
  all_hids AS (
    SELECT hid FROM topups UNION SELECT hid FROM withdrawals UNION SELECT hid FROM commissions
  )
  SELECT a.hid,
         COALESCE(p.full_name, p.username, a.hid::text) AS helper_name,
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
  ORDER BY (COALESCE(t.diamonds,0) + COALESCE(w.dia,0)) DESC,
           COALESCE(w.usd,0) DESC
  LIMIT p_limit;
END $$;

REVOKE ALL ON FUNCTION public.compute_helper_diamond_payouts(TIMESTAMPTZ,TIMESTAMPTZ,INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_helper_diamond_payouts(TIMESTAMPTZ,TIMESTAMPTZ,INT) TO authenticated;

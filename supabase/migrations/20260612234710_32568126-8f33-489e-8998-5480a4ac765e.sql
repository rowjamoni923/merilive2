-- Replace the admin guard in all profit/payouts analytics RPCs with is_admin_request(),
-- which honors both the Supabase auth role AND the admin-panel custom session header.

CREATE OR REPLACE FUNCTION public.compute_profit_for_range(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(sector_key text, display_name text, gross_revenue_usd numeric, company_cut_usd numeric, payouts_usd numeric, gateway_cost_usd numeric, net_profit_usd numeric, transaction_count bigint, company_cut_percent numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_coin_rate NUMERIC;
  v_bean_rate NUMERIC;
BEGIN
  IF NOT public.is_admin_request() THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  v_coin_rate := public.get_official_coin_usd_rate();
  v_bean_rate := v_coin_rate;

  RETURN QUERY
  WITH cfg AS (SELECT * FROM public.profit_config WHERE is_active),
  s_recharge AS (
    SELECT 'recharge'::text AS k, COALESCE(SUM(usd_amount),0)::numeric AS gross, COUNT(*)::bigint AS cnt
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
  s_gift AS (
    SELECT 'gift'::text AS k,
           COALESCE(SUM(COALESCE(total_coins, coin_cost * COALESCE(quantity,1), coin_amount * COALESCE(quantity,1), 0)),0)::numeric AS gross_coins,
           COALESCE(SUM(COALESCE(receiver_beans,0)),0)::numeric AS payout_beans,
           COUNT(*)::bigint AS cnt
    FROM public.gift_transactions WHERE created_at BETWEEN p_start AND p_end
  ),
  s_call AS (
    SELECT 'private_call'::text AS k,
           COALESCE(SUM(COALESCE(total_coins_deducted, coins_spent, 0)),0)::numeric AS gross_coins,
           COALESCE(SUM(COALESCE(host_earned, host_earnings_amount, 0)),0)::numeric AS payout_coins,
           COUNT(*)::bigint AS cnt
    FROM public.private_calls
    WHERE COALESCE(ended_at, created_at) BETWEEN p_start AND p_end AND status IN ('ended','completed','settled')
  ),
  s_agency AS (
    SELECT 'agency_withdrawal_fee'::text AS k,
           COALESCE(SUM(COALESCE(usd_amount, amount)),0)::numeric AS gross_usd,
           COALESCE(SUM(COALESCE(usd_amount, amount) * COALESCE(fee_percentage,0)/100.0),0)::numeric AS fee_usd,
           COUNT(*)::bigint AS cnt
    FROM public.agency_withdrawals
    WHERE status IN ('completed','approved','paid') AND COALESCE(processed_at, requested_at) BETWEEN p_start AND p_end
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
    FROM public.game_transactions WHERE created_at BETWEEN p_start AND p_end
  ),
  s_vip AS (
    SELECT 'vip_subscription'::text AS k, COALESCE(SUM(COALESCE(amount_paid,0)),0)::numeric AS gross_usd, COUNT(*)::bigint AS cnt
    FROM public.user_vip_subscriptions WHERE created_at BETWEEN p_start AND p_end
  ),
  s_noble AS (
    SELECT 'noble_subscription'::text AS k, COALESCE(SUM(COALESCE(diamonds_spent,0)),0)::numeric AS gross_coins, COUNT(*)::bigint AS cnt
    FROM public.user_noble_subscriptions WHERE created_at BETWEEN p_start AND p_end
  ),
  s_sub AS (
    SELECT 'subscription_order'::text AS k, COALESCE(SUM(COALESCE(amount,0)),0)::numeric AS gross_usd, COUNT(*)::bigint AS cnt
    FROM public.subscription_orders WHERE status IN ('completed','approved','paid') AND created_at BETWEEN p_start AND p_end
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
    SELECT 'pk_battle'::text AS k, COALESCE(SUM(COALESCE(total_gift_value,0)),0)::numeric AS gross_coins, COUNT(*)::bigint AS cnt
    FROM public.pk_battles WHERE COALESCE(ended_at,created_at) BETWEEN p_start AND p_end AND status IN ('ended','completed')
  ),
  s_lucky AS (
    SELECT 'lucky_gift'::text AS k, COALESCE(SUM(COALESCE(diamonds_won,0)),0)::numeric AS payout_coins, COUNT(*)::bigint AS cnt
    FROM public.lucky_gift_results WHERE created_at BETWEEN p_start AND p_end
  ),
  agg AS (
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_recharge.gross AS gross_usd, s_recharge.gross * (c.gateway_cost_percent/100.0) AS gateway_cost,
      0::numeric AS payouts, s_recharge.cnt AS cnt
    FROM cfg c JOIN s_recharge ON c.sector_key=s_recharge.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, s_helper.gross, 0::numeric, s_helper.commission, s_helper.cnt
    FROM cfg c JOIN s_helper ON c.sector_key=s_helper.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, s_gift.gross_coins * v_coin_rate, 0::numeric, s_gift.payout_beans * v_bean_rate, s_gift.cnt
    FROM cfg c JOIN s_gift ON c.sector_key=s_gift.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, s_call.gross_coins * v_coin_rate, 0::numeric, s_call.payout_coins * v_coin_rate, s_call.cnt
    FROM cfg c JOIN s_call ON c.sector_key=s_call.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, s_agency.fee_usd, 0::numeric, 0::numeric, s_agency.cnt
    FROM cfg c JOIN s_agency ON c.sector_key=s_agency.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, (s_exchange.gross_beans * v_bean_rate), 0::numeric, (s_exchange.payout_coins * v_coin_rate), s_exchange.cnt
    FROM cfg c JOIN s_exchange ON c.sector_key=s_exchange.k
    UNION ALL
    SELECT c.sector_key, c.display_name, c.company_cut_percent, s_game.bets * v_coin_rate, 0::numeric, s_game.wins * v_coin_rate, s_game.cnt
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
  SELECT agg.sector_key, agg.display_name,
    ROUND(agg.gross_usd, 4),
    ROUND(CASE
      WHEN agg.sector_key IN ('gift','private_call','exchange','game') THEN GREATEST(agg.gross_usd - agg.payouts, 0)
      WHEN agg.sector_key = 'agency_withdrawal_fee' THEN agg.gross_usd
      ELSE agg.gross_usd * (agg.company_cut_percent/100.0)
    END, 4),
    ROUND(agg.payouts, 4),
    ROUND(agg.gateway_cost, 4),
    ROUND(
      CASE
        WHEN agg.sector_key IN ('gift','private_call','exchange','game') THEN GREATEST(agg.gross_usd - agg.payouts, 0)
        WHEN agg.sector_key = 'agency_withdrawal_fee' THEN agg.gross_usd
        ELSE agg.gross_usd * (agg.company_cut_percent/100.0)
      END - agg.gateway_cost
    , 4),
    agg.cnt, agg.company_cut_percent
  FROM agg
  ORDER BY 6 DESC NULLS LAST;
END $function$;

CREATE OR REPLACE FUNCTION public.compute_profit_timeline(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(day date, sector_key text, gross_revenue_usd numeric, company_cut_usd numeric, payouts_usd numeric, gateway_cost_usd numeric, net_profit_usd numeric, transaction_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d DATE; rec RECORD;
BEGIN
  IF NOT public.is_admin_request() THEN RAISE EXCEPTION 'Forbidden: admin role required'; END IF;
  FOR d IN SELECT generate_series(p_start::date, p_end::date, '1 day'::interval)::date LOOP
    FOR rec IN SELECT * FROM public.compute_profit_for_range(d::timestamptz, (d+1)::timestamptz) LOOP
      day := d; sector_key := rec.sector_key; gross_revenue_usd := rec.gross_revenue_usd;
      company_cut_usd := rec.company_cut_usd; payouts_usd := rec.payouts_usd;
      gateway_cost_usd := rec.gateway_cost_usd; net_profit_usd := rec.net_profit_usd;
      transaction_count := rec.transaction_count;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.compute_payouts_for_range(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(category_key text, display_name text, payout_usd numeric, payout_diamonds numeric, transaction_count bigint, recipient_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_coin_rate NUMERIC;
BEGIN
  IF NOT public.is_admin_request() THEN RAISE EXCEPTION 'Forbidden: admin role required'; END IF;
  v_coin_rate := public.get_official_coin_usd_rate();

  RETURN QUERY
  SELECT 'agency_withdrawal'::text, 'Agency Withdrawals'::text,
         ROUND(COALESCE(SUM(COALESCE(net_amount_money, usd_amount, amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(net_diamonds_to_helper,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT agency_id)::bigint
  FROM public.agency_withdrawals
  WHERE status IN ('completed','approved','paid') AND COALESCE(processed_at, requested_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'helper_withdrawal', 'Helper Withdrawals',
         ROUND(COALESCE(SUM(COALESCE(helper_net_reward, usd_amount, amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(diamond_reward,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT helper_id)::bigint
  FROM public.helper_withdrawal_requests
  WHERE status IN ('completed','approved','paid') AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'helper_topup', 'Helper Diamond Top-ups',
         ROUND(COALESCE(SUM(COALESCE(amount_usd, amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(coin_amount,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT helper_id)::bigint
  FROM public.helper_topup_requests
  WHERE status IN ('completed','approved') AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'helper_commission', 'Helper Order Commissions',
         ROUND(COALESCE(SUM(COALESCE(commission_amount,0)),0)::numeric, 4),
         0::numeric, COUNT(*)::bigint, COUNT(DISTINCT helper_id)::bigint
  FROM public.helper_orders
  WHERE status IN ('completed','approved','delivered') AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'host_payroll', 'Host Payroll Payouts',
         ROUND(COALESCE(SUM(COALESCE(usd_amount,0)),0)::numeric, 4),
         0::numeric, COUNT(*)::bigint, COUNT(DISTINCT user_id)::bigint
  FROM public.payroll_requests
  WHERE status IN ('completed','approved','paid') AND COALESCE(reviewed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'agency_host_transfer', 'Agency → Host Earnings',
         ROUND(COALESCE(SUM(amount),0)::numeric, 4),
         0::numeric, COUNT(*)::bigint, COUNT(DISTINCT host_id)::bigint
  FROM public.agency_earnings_transfers
  WHERE COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'beans_exchange', 'Beans → Diamonds Reward',
         ROUND((COALESCE(SUM(diamonds_reward),0) * v_coin_rate)::numeric, 4),
         COALESCE(SUM(diamonds_reward),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT user_id)::bigint
  FROM public.user_beans_exchanges
  WHERE status IN ('completed','approved') AND COALESCE(completed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'game_winnings', 'Game Winnings (User Wins)',
         ROUND((COALESCE(SUM(COALESCE(win_amount,0)),0) * v_coin_rate)::numeric, 4),
         COALESCE(SUM(COALESCE(win_amount,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT user_id)::bigint
  FROM public.game_transactions
  WHERE created_at BETWEEN p_start AND p_end AND COALESCE(win_amount,0) > 0;
END $function$;

CREATE OR REPLACE FUNCTION public.compute_payouts_timeline(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(day date, category_key text, payout_usd numeric, payout_diamonds numeric, transaction_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d DATE; rec RECORD;
BEGIN
  IF NOT public.is_admin_request() THEN RAISE EXCEPTION 'Forbidden: admin role required'; END IF;
  FOR d IN SELECT generate_series(p_start::date, p_end::date, '1 day'::interval)::date LOOP
    FOR rec IN SELECT * FROM public.compute_payouts_for_range(d::timestamptz, (d+1)::timestamptz) LOOP
      day := d; category_key := rec.category_key;
      payout_usd := rec.payout_usd; payout_diamonds := rec.payout_diamonds;
      transaction_count := rec.transaction_count;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.compute_helper_diamond_payouts(p_start timestamp with time zone, p_end timestamp with time zone, p_limit integer DEFAULT 200)
 RETURNS TABLE(helper_id uuid, helper_name text, diamonds_topped_up numeric, usd_withdrawn numeric, diamond_withdrawal_reward numeric, commission_usd numeric, topup_count bigint, withdrawal_count bigint, order_count bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_request() THEN RAISE EXCEPTION 'Forbidden: admin role required'; END IF;
  RETURN QUERY
  WITH topups AS (
    SELECT helper_id AS hid, COALESCE(SUM(coin_amount),0)::numeric AS diamonds, COUNT(*)::bigint AS cnt
    FROM public.helper_topup_requests
    WHERE status IN ('completed','approved') AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
    GROUP BY helper_id
  ),
  withdrawals AS (
    SELECT helper_id AS hid, COALESCE(SUM(COALESCE(helper_net_reward, usd_amount, amount)),0)::numeric AS usd,
           COALESCE(SUM(COALESCE(diamond_reward,0)),0)::numeric AS dia, COUNT(*)::bigint AS cnt
    FROM public.helper_withdrawal_requests
    WHERE status IN ('completed','approved','paid') AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
    GROUP BY helper_id
  ),
  commissions AS (
    SELECT helper_id AS hid, COALESCE(SUM(commission_amount),0)::numeric AS usd, COUNT(*)::bigint AS cnt
    FROM public.helper_orders
    WHERE status IN ('completed','approved','delivered') AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
    GROUP BY helper_id
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

CREATE OR REPLACE FUNCTION public.compute_sales_by_source(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(source_key text, display_name text, gross_usd numeric, transaction_count bigint, unique_buyers bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_request() THEN RAISE EXCEPTION 'Forbidden: admin role required'; END IF;
  RETURN QUERY
  SELECT 'official_recharge'::text, 'Official (Play Store / Direct)'::text,
         ROUND(COALESCE(SUM(usd_amount),0)::numeric, 4),
         COUNT(*)::bigint, COUNT(DISTINCT user_id)::bigint
  FROM public.recharge_transactions
  WHERE status IN ('completed','approved') AND COALESCE(processed_at, created_at) BETWEEN p_start AND p_end
  UNION ALL
  SELECT 'helper_level_' || COALESCE(th.trader_level::text, '0'),
         'Helper L' || COALESCE(th.trader_level::text, '0') || ' Sales',
         ROUND(COALESCE(SUM(COALESCE(ho.amount_usd, ho.total_price_usd, 0)),0)::numeric, 4),
         COUNT(*)::bigint, COUNT(DISTINCT ho.customer_id)::bigint
  FROM public.helper_orders ho
  LEFT JOIN public.topup_helpers th ON th.id = ho.helper_id
  WHERE ho.status IN ('completed','approved','delivered')
    AND COALESCE(ho.processed_at, ho.created_at) BETWEEN p_start AND p_end
  GROUP BY th.trader_level;
END $function$;

CREATE OR REPLACE FUNCTION public.compute_company_health(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(company_profit_usd numeric, total_payouts_usd numeric, net_balance_usd numeric, health_percent numeric, status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_profit NUMERIC := 0; v_payouts NUMERIC := 0; v_health NUMERIC := 100; v_status TEXT := 'healthy';
BEGIN
  IF NOT public.is_admin_request() THEN RAISE EXCEPTION 'Forbidden: admin role required'; END IF;
  SELECT COALESCE(SUM(net_profit_usd),0) INTO v_profit FROM public.compute_profit_for_range(p_start, p_end);
  SELECT COALESCE(SUM(payout_usd),0) INTO v_payouts FROM public.compute_payouts_for_range(p_start, p_end);
  IF (v_profit + v_payouts) <= 0 THEN
    v_health := 100;
  ELSE
    v_health := ROUND((v_profit / (v_profit + v_payouts)) * 100, 2);
    IF v_health < 0 THEN v_health := 0; END IF;
    IF v_health > 100 THEN v_health := 100; END IF;
  END IF;
  v_status := CASE
    WHEN v_health >= 90 THEN 'healthy' WHEN v_health >= 70 THEN 'good'
    WHEN v_health >= 50 THEN 'caution' WHEN v_health >= 30 THEN 'warning'
    ELSE 'critical' END;
  company_profit_usd := ROUND(v_profit, 4);
  total_payouts_usd := ROUND(v_payouts, 4);
  net_balance_usd := ROUND(v_profit - v_payouts, 4);
  health_percent := v_health;
  status := v_status;
  RETURN NEXT;
END $function$;

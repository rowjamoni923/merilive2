
CREATE OR REPLACE FUNCTION public.get_official_coin_usd_rate()
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT SUM(price_usd)::numeric
            / NULLIF(SUM(coins_amount + COALESCE(bonus_coins, 0)), 0)
       FROM public.coin_packages
       WHERE is_active = true AND price_usd > 0),
    (SELECT (meta->>'coin_to_usd_rate')::numeric
       FROM public.profit_config
       WHERE sector_key = '_global'),
    0.0001
  );
$$;

REVOKE ALL ON FUNCTION public.get_official_coin_usd_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_official_coin_usd_rate() TO authenticated;

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

  -- Official rate from active top-up packages (weighted avg USD per coin)
  v_coin_rate := public.get_official_coin_usd_rate();
  v_bean_rate := v_coin_rate;  -- beans valued at the same official coin rate

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
  s_gift AS (
    SELECT 'gift'::text AS k,
           COALESCE(SUM(COALESCE(coin_cost_total, coin_amount * COALESCE(quantity,1))),0)::numeric AS gross_coins,
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
    FROM public.user_vip_subscriptions
    WHERE created_at BETWEEN p_start AND p_end
  ),
  s_noble AS (
    SELECT 'noble_subscription'::text AS k,
           COALESCE(SUM(COALESCE(diamonds_spent,0)),0)::numeric AS gross_coins,
           COUNT(*)::bigint AS cnt
    FROM public.user_noble_subscriptions
    WHERE created_at BETWEEN p_start AND p_end
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
    FROM public.user_purchases
    WHERE purchased_at BETWEEN p_start AND p_end
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
      0::numeric AS payouts,
      s_recharge.cnt AS cnt
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
      s_exchange.gross_beans * v_bean_rate, 0::numeric, s_exchange.payout_coins * v_coin_rate, s_exchange.cnt
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
    agg.sector_key,
    agg.display_name,
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
    agg.cnt,
    agg.company_cut_percent
  FROM agg
  ORDER BY net_profit_usd DESC NULLS LAST;
END $$;

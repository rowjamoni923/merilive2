
-- ============================================================
-- Company Profit Analytics — Phase 1
-- ============================================================

-- 1. profit_config: central source of truth for company cut % per sector
CREATE TABLE IF NOT EXISTS public.profit_config (
  sector_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'revenue',
  company_cut_percent NUMERIC NOT NULL DEFAULT 0,
  default_payout_percent NUMERIC NOT NULL DEFAULT 0,
  gateway_cost_percent NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 100,
  notes TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profit_config TO authenticated;
GRANT ALL ON public.profit_config TO service_role;
ALTER TABLE public.profit_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage profit_config"
ON public.profit_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins read profit_config"
ON public.profit_config FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Seed sectors (idempotent)
INSERT INTO public.profit_config (sector_key, display_name, company_cut_percent, default_payout_percent, gateway_cost_percent, sort_order, notes) VALUES
  ('_global',             'Global Settings',          0,   0,  0,  0,   'meta.coin_to_usd_rate (default 0.01 = 100 coins per $1), meta.bean_to_usd_rate (default 0.005)'),
  ('recharge',            'Coin Recharge',            97,  0,  3,  10,  'Direct recharge. Company keeps 97% after 3% avg gateway fee.'),
  ('helper_order',        'Helper Recharge Orders',   90,  10, 0,  20,  'Helper commission deducted; rest is company revenue.'),
  ('gift',                'Gift Send',                30,  70, 0,  30,  'Computed live from coin_cost_total − receiver_beans.'),
  ('private_call',        'Private Call',             40,  60, 0,  40,  'Computed live from coins_spent − host_earned (or platform_cut_percent).'),
  ('agency_withdrawal_fee','Agency Withdrawal Fee',   100, 0,  0,  50,  'Company collects fee_percentage on each withdrawal.'),
  ('exchange',            'Beans → Diamonds Exchange',5,   95, 0,  60,  'Configurable spread on internal exchange.'),
  ('game',                'In-app Games',             100, 0,  0,  70,  'House edge = SUM(bet) − SUM(win).'),
  ('vip_subscription',    'VIP Subscription',         100, 0,  3,  80,  'Computed from user_vip_subscriptions.amount_paid.'),
  ('noble_subscription',  'Noble Subscription',       100, 0,  0,  90,  'diamonds_spent × coin_to_usd_rate.'),
  ('subscription_order',  'Subscription Orders',      97,  0,  3,  100, 'subscription_orders.amount.'),
  ('shop_purchase',       'Shop Purchases',           100, 0,  0,  110, 'user_purchases (coins/diamonds spent).'),
  ('party_room',          'Party Room Activity',      0,   0,  0,  120, 'Informational only — gifts already counted in gift sector.'),
  ('pk_battle',           'PK Battle Activity',       0,   0,  0,  130, 'Informational only — gifts already counted in gift sector.'),
  ('lucky_gift',          'Lucky Gift Activity',      0,   0,  0,  140, 'Informational only — coin flow part of gift sector.')
ON CONFLICT (sector_key) DO NOTHING;

UPDATE public.profit_config
SET meta = jsonb_build_object('coin_to_usd_rate', 0.01, 'bean_to_usd_rate', 0.005)
WHERE sector_key = '_global' AND meta = '{}'::jsonb;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.profit_config_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_profit_config_updated_at ON public.profit_config;
CREATE TRIGGER trg_profit_config_updated_at
BEFORE UPDATE ON public.profit_config
FOR EACH ROW EXECUTE FUNCTION public.profit_config_touch_updated_at();

-- 2. profit_daily_snapshots (reserved for future cron; live function used now)
CREATE TABLE IF NOT EXISTS public.profit_daily_snapshots (
  snapshot_date DATE NOT NULL,
  sector_key TEXT NOT NULL REFERENCES public.profit_config(sector_key) ON DELETE CASCADE,
  gross_revenue_usd NUMERIC NOT NULL DEFAULT 0,
  company_cut_usd NUMERIC NOT NULL DEFAULT 0,
  payouts_usd NUMERIC NOT NULL DEFAULT 0,
  gateway_cost_usd NUMERIC NOT NULL DEFAULT 0,
  net_profit_usd NUMERIC NOT NULL DEFAULT 0,
  transaction_count INT NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, sector_key)
);

GRANT SELECT ON public.profit_daily_snapshots TO authenticated;
GRANT ALL ON public.profit_daily_snapshots TO service_role;
ALTER TABLE public.profit_daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read profit_daily_snapshots"
ON public.profit_daily_snapshots FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_profit_snapshots_date ON public.profit_daily_snapshots(snapshot_date DESC);

-- 3. compute_profit_for_range — live aggregation across all sectors
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
  -- Admin guard
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT COALESCE((meta->>'coin_to_usd_rate')::numeric, 0.01),
         COALESCE((meta->>'bean_to_usd_rate')::numeric, 0.005)
    INTO v_coin_rate, v_bean_rate
  FROM public.profit_config WHERE sector_key = '_global';

  v_coin_rate := COALESCE(v_coin_rate, 0.01);
  v_bean_rate := COALESCE(v_bean_rate, 0.005);

  RETURN QUERY
  WITH cfg AS (SELECT * FROM public.profit_config WHERE is_active),
  -- recharge
  s_recharge AS (
    SELECT 'recharge'::text AS k,
           COALESCE(SUM(usd_amount),0)::numeric AS gross,
           COUNT(*)::bigint AS cnt
    FROM public.recharge_transactions
    WHERE status IN ('completed','approved') AND COALESCE(processed_at,created_at) BETWEEN p_start AND p_end
  ),
  -- helper orders
  s_helper AS (
    SELECT 'helper_order'::text AS k,
           COALESCE(SUM(COALESCE(amount_usd,total_price_usd,0)),0)::numeric AS gross,
           COALESCE(SUM(COALESCE(commission_amount,0)),0)::numeric AS commission,
           COUNT(*)::bigint AS cnt
    FROM public.helper_orders
    WHERE status IN ('completed','approved','delivered') AND COALESCE(processed_at,created_at) BETWEEN p_start AND p_end
  ),
  -- gifts
  s_gift AS (
    SELECT 'gift'::text AS k,
           COALESCE(SUM(COALESCE(coin_cost_total, coin_amount * COALESCE(quantity,1))),0)::numeric AS gross_coins,
           COALESCE(SUM(COALESCE(receiver_beans,0)),0)::numeric AS payout_beans,
           COUNT(*)::bigint AS cnt
    FROM public.gift_transactions
    WHERE created_at BETWEEN p_start AND p_end
  ),
  -- private call
  s_call AS (
    SELECT 'private_call'::text AS k,
           COALESCE(SUM(COALESCE(total_coins_deducted, coins_spent, 0)),0)::numeric AS gross_coins,
           COALESCE(SUM(COALESCE(host_earned, host_earnings_amount, 0)),0)::numeric AS payout_coins,
           COUNT(*)::bigint AS cnt
    FROM public.private_calls
    WHERE COALESCE(ended_at, created_at) BETWEEN p_start AND p_end
      AND status IN ('ended','completed','settled')
  ),
  -- agency withdrawal fee (money out, fee retained)
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
  -- exchange (beans -> diamonds)
  s_exchange AS (
    SELECT 'exchange'::text AS k,
           COALESCE(SUM(beans_amount),0)::numeric AS gross_beans,
           COALESCE(SUM(diamonds_reward),0)::numeric AS payout_coins,
           COUNT(*)::bigint AS cnt
    FROM public.user_beans_exchanges
    WHERE status IN ('completed','approved') AND COALESCE(completed_at,created_at) BETWEEN p_start AND p_end
  ),
  -- game
  s_game AS (
    SELECT 'game'::text AS k,
           COALESCE(SUM(COALESCE(bet_amount,0)),0)::numeric AS bets,
           COALESCE(SUM(COALESCE(win_amount,0)),0)::numeric AS wins,
           COUNT(*)::bigint AS cnt
    FROM public.game_transactions
    WHERE created_at BETWEEN p_start AND p_end
  ),
  -- vip subscription
  s_vip AS (
    SELECT 'vip_subscription'::text AS k,
           COALESCE(SUM(COALESCE(amount_paid,0)),0)::numeric AS gross_usd,
           COUNT(*)::bigint AS cnt
    FROM public.user_vip_subscriptions
    WHERE created_at BETWEEN p_start AND p_end
  ),
  -- noble subscription
  s_noble AS (
    SELECT 'noble_subscription'::text AS k,
           COALESCE(SUM(COALESCE(diamonds_spent,0)),0)::numeric AS gross_coins,
           COUNT(*)::bigint AS cnt
    FROM public.user_noble_subscriptions
    WHERE created_at BETWEEN p_start AND p_end
  ),
  -- subscription orders
  s_sub AS (
    SELECT 'subscription_order'::text AS k,
           COALESCE(SUM(COALESCE(amount,0)),0)::numeric AS gross_usd,
           COUNT(*)::bigint AS cnt
    FROM public.subscription_orders
    WHERE status IN ('completed','approved','paid') AND created_at BETWEEN p_start AND p_end
  ),
  -- shop purchase
  s_shop AS (
    SELECT 'shop_purchase'::text AS k,
           COALESCE(SUM(CASE WHEN currency_type IN ('coin','coins','diamond','diamonds') THEN COALESCE(price_paid,0) ELSE 0 END),0)::numeric AS gross_coins,
           COUNT(*)::bigint AS cnt
    FROM public.user_purchases
    WHERE purchased_at BETWEEN p_start AND p_end
  ),
  -- party room (informational)
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
    -- recharge
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_recharge.gross AS gross_usd,
      s_recharge.gross * (c.gateway_cost_percent/100.0) AS gateway_cost,
      0::numeric AS payouts,
      s_recharge.cnt AS cnt
    FROM cfg c JOIN s_recharge ON c.sector_key=s_recharge.k
    UNION ALL
    -- helper_order
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_helper.gross,
      0::numeric,
      s_helper.commission,
      s_helper.cnt
    FROM cfg c JOIN s_helper ON c.sector_key=s_helper.k
    UNION ALL
    -- gift
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_gift.gross_coins * v_coin_rate,
      0::numeric,
      s_gift.payout_beans * v_bean_rate,
      s_gift.cnt
    FROM cfg c JOIN s_gift ON c.sector_key=s_gift.k
    UNION ALL
    -- private_call
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_call.gross_coins * v_coin_rate,
      0::numeric,
      s_call.payout_coins * v_coin_rate,
      s_call.cnt
    FROM cfg c JOIN s_call ON c.sector_key=s_call.k
    UNION ALL
    -- agency_withdrawal_fee
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_agency.fee_usd,  -- gross-for-company = fee itself
      0::numeric,
      0::numeric,
      s_agency.cnt
    FROM cfg c JOIN s_agency ON c.sector_key=s_agency.k
    UNION ALL
    -- exchange
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      (s_exchange.gross_beans * v_bean_rate),
      0::numeric,
      (s_exchange.payout_coins * v_coin_rate),
      s_exchange.cnt
    FROM cfg c JOIN s_exchange ON c.sector_key=s_exchange.k
    UNION ALL
    -- game
    SELECT c.sector_key, c.display_name, c.company_cut_percent,
      s_game.bets * v_coin_rate,
      0::numeric,
      s_game.wins * v_coin_rate,
      s_game.cnt
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
    agg.cnt,
    agg.company_cut_percent
  FROM agg
  ORDER BY net_profit_usd DESC NULLS LAST;
END $$;

REVOKE ALL ON FUNCTION public.compute_profit_for_range(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_profit_for_range(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

-- 4. Daily timeline helper: per-day net profit total
CREATE OR REPLACE FUNCTION public.compute_profit_timeline(
  p_start TIMESTAMPTZ,
  p_end   TIMESTAMPTZ
)
RETURNS TABLE (day DATE, sector_key TEXT, net_profit_usd NUMERIC)
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
      SELECT sector_key AS sk, net_profit_usd AS np
      FROM public.compute_profit_for_range(d::timestamptz, (d + 1)::timestamptz)
    LOOP
      day := d;
      sector_key := rec.sk;
      net_profit_usd := rec.np;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.compute_profit_timeline(TIMESTAMPTZ,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_profit_timeline(TIMESTAMPTZ,TIMESTAMPTZ) TO authenticated;

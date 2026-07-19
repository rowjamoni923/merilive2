
-- 1. compute_payouts_for_range: rename v_coin_rate, fix comment + label
CREATE OR REPLACE FUNCTION public.compute_payouts_for_range(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(category_key text, display_name text, payout_usd numeric, payout_diamonds numeric, transaction_count bigint, recipient_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_diamond_rate NUMERIC;
BEGIN
  IF NOT public.is_admin_request() THEN RAISE EXCEPTION 'Forbidden: admin role required'; END IF;
  v_diamond_rate := public.get_official_diamond_usd_rate();

  RETURN QUERY
  SELECT 'agency_withdrawal'::text, 'Agency Withdrawals (cash out)'::text,
         ROUND(COALESCE(SUM(COALESCE(aw.net_amount_money, aw.usd_amount, aw.amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(aw.net_diamonds_to_helper,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT aw.agency_id)::bigint
  FROM public.agency_withdrawals aw
  WHERE aw.status IN ('completed','approved','paid')
    AND COALESCE(aw.processed_at, aw.requested_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'helper_withdrawal'::text, 'Helper Withdrawals (cash out)'::text,
         ROUND(COALESCE(SUM(COALESCE(hwr.helper_net_reward, hwr.usd_amount, hwr.amount)),0)::numeric, 4),
         COALESCE(SUM(COALESCE(hwr.diamond_reward,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT hwr.helper_id)::bigint
  FROM public.helper_withdrawal_requests hwr
  WHERE hwr.status IN ('completed','approved','paid')
    AND COALESCE(hwr.processed_at, hwr.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'host_payroll'::text, 'Host Payroll (cash out)'::text,
         ROUND(COALESCE(SUM(COALESCE(pr.usd_amount,0)),0)::numeric, 4),
         0::numeric, COUNT(*)::bigint, COUNT(DISTINCT pr.user_id)::bigint
  FROM public.payroll_requests pr
  WHERE pr.status IN ('completed','approved','paid')
    AND COALESCE(pr.reviewed_at, pr.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'helper_commission'::text, 'Helper Order Commissions (USD retained by helper)'::text,
         ROUND(COALESCE(SUM(COALESCE(ho.commission_amount,0)),0)::numeric, 4),
         0::numeric, COUNT(*)::bigint, COUNT(DISTINCT ho.helper_id)::bigint
  FROM public.helper_orders ho
  WHERE ho.status IN ('completed','approved','delivered')
    AND COALESCE(ho.processed_at, ho.created_at) BETWEEN p_start AND p_end

  -- INFORMATIONAL — internal diamond transfers (NOT real USD cash out)
  UNION ALL
  SELECT 'info_helper_topup'::text, 'ℹ Diamonds Issued to Helpers (internal)'::text,
         0::numeric,
         COALESCE(SUM(COALESCE(htr.diamond_amount,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT htr.helper_id)::bigint
  FROM public.helper_topup_requests htr
  WHERE htr.status IN ('completed','approved')
    AND COALESCE(htr.processed_at, htr.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_agency_host_transfer'::text, 'ℹ Agency→Host Earnings (internal)'::text,
         0::numeric, 0::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT aet.host_id)::bigint
  FROM public.agency_earnings_transfers aet
  WHERE COALESCE(aet.processed_at, aet.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_beans_exchange'::text, 'ℹ Beans→Diamonds Exchange (internal)'::text,
         0::numeric,
         COALESCE(SUM(COALESCE(ube.diamonds_reward,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT ube.user_id)::bigint
  FROM public.user_beans_exchanges ube
  WHERE ube.status IN ('completed','approved')
    AND COALESCE(ube.completed_at, ube.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_game_winnings'::text, 'ℹ Game Winnings (internal diamond payout)'::text,
         0::numeric,
         COALESCE(SUM(COALESCE(gt.win_amount,0)),0)::numeric,
         COUNT(*)::bigint, COUNT(DISTINCT gt.user_id)::bigint
  FROM public.game_transactions gt
  WHERE gt.created_at BETWEEN p_start AND p_end AND COALESCE(gt.win_amount,0) > 0;
END $function$;

-- 2. compute_profit_for_range: rename v_coin_rate, fix labels
CREATE OR REPLACE FUNCTION public.compute_profit_for_range(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(sector_key text, display_name text, gross_revenue_usd numeric, company_cut_usd numeric, payouts_usd numeric, gateway_cost_usd numeric, net_profit_usd numeric, transaction_count bigint, company_cut_percent numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_diamond_rate NUMERIC;
  v_bean_rate NUMERIC;
  v_recharge_gateway_pct NUMERIC := 0;
  v_vip_gateway_pct NUMERIC := 0;
  v_sub_gateway_pct NUMERIC := 0;
BEGIN
  IF NOT public.is_admin_request() THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  v_diamond_rate := public.get_official_diamond_usd_rate();
  v_bean_rate := v_diamond_rate;

  SELECT COALESCE(pc.gateway_cost_percent,0) INTO v_recharge_gateway_pct FROM public.profit_config pc WHERE pc.sector_key='recharge' AND pc.is_active LIMIT 1;
  SELECT COALESCE(pc.gateway_cost_percent,0) INTO v_vip_gateway_pct      FROM public.profit_config pc WHERE pc.sector_key='vip_subscription' AND pc.is_active LIMIT 1;
  SELECT COALESCE(pc.gateway_cost_percent,0) INTO v_sub_gateway_pct      FROM public.profit_config pc WHERE pc.sector_key='subscription_order' AND pc.is_active LIMIT 1;

  RETURN QUERY
  SELECT 'recharge'::text, 'Official Recharge'::text,
    ROUND(COALESCE(SUM(rt.usd_amount),0)::numeric,4) AS gross,
    ROUND(COALESCE(SUM(rt.usd_amount),0)::numeric * (1 - v_recharge_gateway_pct/100.0),4) AS company_cut,
    0::numeric AS payouts,
    ROUND(COALESCE(SUM(rt.usd_amount),0)::numeric * (v_recharge_gateway_pct/100.0),4) AS gateway_cost,
    ROUND(COALESCE(SUM(rt.usd_amount),0)::numeric * (1 - v_recharge_gateway_pct/100.0),4) AS net_profit,
    COUNT(*)::bigint, (100 - v_recharge_gateway_pct)::numeric
  FROM public.recharge_transactions rt
  WHERE rt.status IN ('completed','approved')
    AND COALESCE(rt.processed_at, rt.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'helper_order'::text, 'Helper Channel Sales (net of commission)'::text,
    ROUND(COALESCE(SUM(COALESCE(ho.amount_usd, ho.total_price_usd, 0)),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(ho.amount_usd, ho.total_price_usd, 0) - COALESCE(ho.commission_amount,0)),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(ho.commission_amount,0)),0)::numeric,4),
    0::numeric,
    ROUND(COALESCE(SUM(COALESCE(ho.amount_usd, ho.total_price_usd, 0) - COALESCE(ho.commission_amount,0)),0)::numeric,4),
    COUNT(*)::bigint, NULL::numeric
  FROM public.helper_orders ho
  WHERE ho.status IN ('completed','approved','delivered')
    AND COALESCE(ho.processed_at, ho.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'agency_withdrawal_fee'::text, 'Agency Withdrawal Fees'::text,
    ROUND(COALESCE(SUM(COALESCE(aw.usd_amount, aw.amount) * COALESCE(aw.fee_percentage,0)/100.0),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(aw.usd_amount, aw.amount) * COALESCE(aw.fee_percentage,0)/100.0),0)::numeric,4),
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(aw.usd_amount, aw.amount) * COALESCE(aw.fee_percentage,0)/100.0),0)::numeric,4),
    COUNT(*)::bigint, 100::numeric
  FROM public.agency_withdrawals aw
  WHERE aw.status IN ('completed','approved','paid')
    AND COALESCE(aw.processed_at, aw.requested_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'vip_subscription'::text, 'VIP Subscriptions'::text,
    ROUND(COALESCE(SUM(COALESCE(uvs.amount_paid,0)),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(uvs.amount_paid,0)),0)::numeric * (1 - v_vip_gateway_pct/100.0),4),
    0::numeric,
    ROUND(COALESCE(SUM(COALESCE(uvs.amount_paid,0)),0)::numeric * (v_vip_gateway_pct/100.0),4),
    ROUND(COALESCE(SUM(COALESCE(uvs.amount_paid,0)),0)::numeric * (1 - v_vip_gateway_pct/100.0),4),
    COUNT(*)::bigint, (100 - v_vip_gateway_pct)::numeric
  FROM public.user_vip_subscriptions uvs
  WHERE uvs.created_at BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'subscription_order'::text, 'Subscription Orders'::text,
    ROUND(COALESCE(SUM(COALESCE(so.amount,0)),0)::numeric,4),
    ROUND(COALESCE(SUM(COALESCE(so.amount,0)),0)::numeric * (1 - v_sub_gateway_pct/100.0),4),
    0::numeric,
    ROUND(COALESCE(SUM(COALESCE(so.amount,0)),0)::numeric * (v_sub_gateway_pct/100.0),4),
    ROUND(COALESCE(SUM(COALESCE(so.amount,0)),0)::numeric * (1 - v_sub_gateway_pct/100.0),4),
    COUNT(*)::bigint, (100 - v_sub_gateway_pct)::numeric
  FROM public.subscription_orders so
  WHERE so.status IN ('completed','approved','paid')
    AND so.created_at BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'payout_agency_withdrawal'::text, '(−) Agency Withdrawals Paid'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(aw.net_amount_money, aw.usd_amount, aw.amount)),0)::numeric,4),
    0::numeric,
    ROUND(-1 * COALESCE(SUM(COALESCE(aw.net_amount_money, aw.usd_amount, aw.amount)),0)::numeric,4),
    COUNT(*)::bigint, NULL::numeric
  FROM public.agency_withdrawals aw
  WHERE aw.status IN ('completed','approved','paid')
    AND COALESCE(aw.processed_at, aw.requested_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'payout_helper_withdrawal'::text, '(−) Helper Withdrawals Paid'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(hwr.helper_net_reward, hwr.usd_amount, hwr.amount)),0)::numeric,4),
    0::numeric,
    ROUND(-1 * COALESCE(SUM(COALESCE(hwr.helper_net_reward, hwr.usd_amount, hwr.amount)),0)::numeric,4),
    COUNT(*)::bigint, NULL::numeric
  FROM public.helper_withdrawal_requests hwr
  WHERE hwr.status IN ('completed','approved','paid')
    AND COALESCE(hwr.processed_at, hwr.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'payout_host_payroll'::text, '(−) Host Payroll Paid'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(pr.usd_amount,0)),0)::numeric,4),
    0::numeric,
    ROUND(-1 * COALESCE(SUM(COALESCE(pr.usd_amount,0)),0)::numeric,4),
    COUNT(*)::bigint, NULL::numeric
  FROM public.payroll_requests pr
  WHERE pr.status IN ('completed','approved','paid')
    AND COALESCE(pr.reviewed_at, pr.created_at) BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_gift_volume'::text, 'ℹ Gift Diamond Volume (already in recharge)'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(gt.total_diamonds, gt.diamond_cost * COALESCE(gt.quantity,1), gt.diamond_amount * COALESCE(gt.quantity,1), 0)),0)::numeric * v_diamond_rate, 4),
    0::numeric, 0::numeric,
    COUNT(*)::bigint, NULL::numeric
  FROM public.gift_transactions gt
  WHERE gt.created_at BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_private_call_volume'::text, 'ℹ Private Call Diamond Volume (already in recharge)'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(pc.total_diamonds_deducted, pc.diamonds_spent, 0)),0)::numeric * v_diamond_rate, 4),
    0::numeric, 0::numeric,
    COUNT(*)::bigint, NULL::numeric
  FROM public.private_calls pc
  WHERE COALESCE(pc.ended_at, pc.created_at) BETWEEN p_start AND p_end
    AND pc.status IN ('ended','completed','settled')

  UNION ALL
  SELECT 'info_game_volume'::text, 'ℹ Game Diamond Volume (already in recharge)'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(COALESCE(gt.bet_amount,0)),0)::numeric * v_diamond_rate, 4),
    0::numeric, 0::numeric,
    COUNT(*)::bigint, NULL::numeric
  FROM public.game_transactions gt
  WHERE gt.created_at BETWEEN p_start AND p_end

  UNION ALL
  SELECT 'info_shop_diamond_volume'::text, 'ℹ Diamond-Shop Volume (already in recharge)'::text,
    0::numeric, 0::numeric,
    ROUND(COALESCE(SUM(CASE WHEN up.currency_type IN ('coin','coins','diamond','diamonds') THEN COALESCE(up.price_paid,0) ELSE 0 END),0)::numeric * v_diamond_rate, 4),
    0::numeric, 0::numeric,
    COUNT(*)::bigint, NULL::numeric
  FROM public.user_purchases up
  WHERE up.purchased_at BETWEEN p_start AND p_end

  ORDER BY 5 DESC NULLS LAST;
END $function$;

-- 3. end_pk_battle: fix "±10 coin rounding" comment
CREATE OR REPLACE FUNCTION public.end_pk_battle(p_battle_id uuid, p_reason text DEFAULT 'time_up'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _battle record; _winner_id uuid; _loser_id uuid; _winner_side text;
  _loser_score bigint; _mvp_id uuid; _final text;
  _punish_secs int := 90; _bonus_total bigint := 0; _bonus_each bigint := 0;
  _reward_pct numeric := 0.70; _team_count int := 1; _member record;
  _tie_tolerance int := 10;  -- ±10 diamond rounding window → draw
  _diff bigint;
BEGIN
  SELECT * INTO _battle FROM public.pk_battles WHERE id = p_battle_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','battle_not_found'); END IF;
  IF _battle.status = 'ended' THEN RETURN jsonb_build_object('ok',true,'already_ended',true); END IF;

  _diff := COALESCE(_battle.challenger_score,0) - COALESCE(_battle.opponent_score,0);

  IF abs(_diff) <= _tie_tolerance THEN
    _winner_id := NULL; _loser_id := NULL; _winner_side := NULL; _final := 'draw';
  ELSIF _diff > 0 THEN
    _winner_id := COALESCE(_battle.challenger_id,_battle.host1_id);
    _loser_id  := COALESCE(_battle.opponent_id,_battle.host2_id);
    _winner_side := 'challenger'; _loser_score := COALESCE(_battle.opponent_score,0);
    _final := 'winner_decided';
  ELSE
    _winner_id := COALESCE(_battle.opponent_id,_battle.host2_id);
    _loser_id  := COALESCE(_battle.challenger_id,_battle.host1_id);
    _winner_side := 'opponent'; _loser_score := COALESCE(_battle.challenger_score,0);
    _final := 'winner_decided';
  END IF;

  IF p_reason IN ('forfeit_left','forfeit_disconnect','cancelled','ended_admin') THEN
    _final := p_reason;
  END IF;

  SELECT sender_id INTO _mvp_id FROM public.pk_battle_gifts
   WHERE battle_id = p_battle_id GROUP BY sender_id ORDER BY SUM(diamond_amount) DESC LIMIT 1;

  IF _winner_side IS NOT NULL AND _loser_score > 0 THEN
    _bonus_total := FLOOR(_loser_score * _reward_pct)::bigint;
    SELECT GREATEST(count(*),1) INTO _team_count FROM public.pk_battle_teams
     WHERE battle_id = p_battle_id AND side = _winner_side;
    _bonus_each := FLOOR(_bonus_total / _team_count)::bigint;
    IF _bonus_each > 0 THEN
      FOR _member IN SELECT user_id FROM public.pk_battle_teams
                      WHERE battle_id = p_battle_id AND side = _winner_side LOOP
        UPDATE public.profiles
           SET beans = COALESCE(beans,0)+_bonus_each,
               beans_balance = COALESCE(beans_balance,0)+_bonus_each,
               total_earnings = COALESCE(total_earnings,0)+_bonus_each,
               updated_at = now()
         WHERE id = _member.user_id;
        INSERT INTO public.diamond_transactions (user_id, diamonds_amount, transaction_type, status, notes)
        VALUES (_member.user_id, _bonus_each, 'pk_battle_reward', 'completed',
          jsonb_build_object('battle_id',p_battle_id,'side',_winner_side,'team_count',_team_count,
                             'reward_pct',_reward_pct,'loser_score',_loser_score,
                             'mvp_user_id',_mvp_id)::text);
      END LOOP;
    END IF;
  END IF;

  IF _final = 'draw' THEN
    UPDATE public.profiles
       SET pk_draws = pk_draws + 1,
           pk_total_battles = pk_total_battles + 1,
           pk_current_streak = 0,
           updated_at = now()
     WHERE id IN (
       COALESCE(_battle.challenger_id,_battle.host1_id),
       COALESCE(_battle.opponent_id,_battle.host2_id)
     ) AND id IS NOT NULL;
  ELSIF _final = 'winner_decided' THEN
    UPDATE public.profiles
       SET pk_wins = pk_wins + 1,
           pk_total_battles = pk_total_battles + 1,
           pk_current_streak = pk_current_streak + 1,
           pk_longest_streak = GREATEST(pk_longest_streak, pk_current_streak + 1),
           updated_at = now()
     WHERE id = _winner_id;
    UPDATE public.profiles
       SET pk_losses = pk_losses + 1,
           pk_total_battles = pk_total_battles + 1,
           pk_current_streak = 0,
           updated_at = now()
     WHERE id = _loser_id;
  END IF;

  UPDATE public.pk_battles
     SET status='ended', ended_at=now(),
         winner_user_id=_winner_id, winner_id=_winner_id,
         mvp_user_id=_mvp_id, final_status=_final,
         punishment_end_ts = CASE WHEN _loser_id IS NOT NULL
            THEN now() + (_punish_secs || ' seconds')::interval ELSE NULL END,
         updated_at = now()
   WHERE id = p_battle_id;

  RETURN jsonb_build_object('ok',true,'winner_user_id',_winner_id,'loser_user_id',_loser_id,
    'mvp_user_id',_mvp_id,'final_status',_final,'bonus_total',_bonus_total,
    'bonus_each',_bonus_each,'team_count',_team_count,'tie_tolerance',_tie_tolerance,
    'punishment_end_ts', CASE WHEN _loser_id IS NOT NULL
      THEN now() + (_punish_secs || ' seconds')::interval ELSE NULL END);
END; $function$;

-- 4. handle_pk_gift_scoring: fix "Coin amount" comment
CREATE OR REPLACE FUNCTION public.handle_pk_gift_scoring()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _active_battle RECORD;
BEGIN
  IF NEW.stream_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Diamond amount must be positive (defensive — DB column is bigint but
  -- a negative would otherwise *decrease* the rival's score in client SUMs).
  IF COALESCE(NEW.diamond_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _active_battle
  FROM public.pk_battles
  WHERE status = 'active'
    AND (host1_id = NEW.receiver_id OR host2_id = NEW.receiver_id)
    AND (stream1_id = NEW.stream_id OR stream2_id = NEW.stream_id)
  ORDER BY started_at DESC NULLS LAST
  LIMIT 1;

  IF _active_battle.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.receiver_id NOT IN (_active_battle.host1_id, _active_battle.host2_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.pk_battle_gifts (
    battle_id, sender_id, target_host_id, gift_id, diamond_amount, receiver_id
  ) VALUES (
    _active_battle.id, NEW.sender_id, NEW.receiver_id,
    NEW.gift_id, NEW.diamond_amount, NEW.receiver_id
  );

  IF _active_battle.host1_id = NEW.receiver_id THEN
    UPDATE public.pk_battles
       SET host1_score = COALESCE(host1_score,0) + NEW.diamond_amount
     WHERE id = _active_battle.id;
  ELSE
    UPDATE public.pk_battles
       SET host2_score = COALESCE(host2_score,0) + NEW.diamond_amount
     WHERE id = _active_battle.id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

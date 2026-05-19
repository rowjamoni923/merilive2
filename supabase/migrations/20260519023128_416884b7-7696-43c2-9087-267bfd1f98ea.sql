-- ============================================================
-- Pkg40: Trader Level Auto-Upgrade by Cumulative Top-up
-- ============================================================
-- Helper trader_level auto-upgrades based on cumulative manual top-up amount.
-- Admin-configurable thresholds in trader_level_tiers.upgrade_cost_usd.
-- Defaults per user spec: L1=$100, L2=$500, L3=$1000, L4=$1500, L5=$2500

-- 1) Set spec thresholds (admin can override anytime via admin panel)
UPDATE public.trader_level_tiers SET upgrade_cost_usd = 100  WHERE level_number = 1;
UPDATE public.trader_level_tiers SET upgrade_cost_usd = 500  WHERE level_number = 2;
UPDATE public.trader_level_tiers SET upgrade_cost_usd = 1000 WHERE level_number = 3;
UPDATE public.trader_level_tiers SET upgrade_cost_usd = 1500 WHERE level_number = 4;
UPDATE public.trader_level_tiers SET upgrade_cost_usd = 2500 WHERE level_number = 5;

-- 2) Replace trigger function: include L5, no hardcoded cap, also runs on insert
CREATE OR REPLACE FUNCTION public.recalculate_helper_trader_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_level integer := 1;
BEGIN
  SELECT COALESCE(MAX(level_number), 1) INTO _new_level
  FROM trader_level_tiers
  WHERE is_active = true
    AND upgrade_cost_usd <= COALESCE(NEW.total_level_upgrade_cost, 0);

  -- never downgrade automatically; only push up
  IF _new_level > COALESCE(NEW.trader_level, 1) THEN
    NEW.trader_level := _new_level;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) Update SwiftPay credit function: cumulative top-up tracking + auto-level-up
CREATE OR REPLACE FUNCTION public.credit_helper_wallet_from_swift_pay(
  p_helper_id uuid,
  p_diamonds  numeric,
  p_topup_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_balance        numeric;
  v_new_level          integer;
  v_already_credited   boolean;
  v_price_usd          numeric := 0;
BEGIN
  -- Idempotency
  SELECT (status = 'credited'), COALESCE(price_usd, 0)
    INTO v_already_credited, v_price_usd
    FROM swift_pay_topups
   WHERE id = p_topup_id;

  IF COALESCE(v_already_credited, false) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_credited');
  END IF;

  -- Credit wallet + accumulate USD into total_level_upgrade_cost
  -- (BEFORE UPDATE trigger on topup_helpers will auto-bump trader_level)
  UPDATE topup_helpers
     SET wallet_balance             = COALESCE(wallet_balance, 0) + p_diamonds,
         total_bought               = COALESCE(total_bought, 0)   + p_diamonds::bigint,
         total_level_upgrade_cost   = COALESCE(total_level_upgrade_cost, 0) + v_price_usd,
         updated_at                 = now()
   WHERE id = p_helper_id
   RETURNING wallet_balance, trader_level INTO v_new_balance, v_new_level;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'helper_not_found %', p_helper_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'new_wallet_balance', v_new_balance,
    'new_trader_level',   v_new_level,
    'topup_usd_added',    v_price_usd
  );
END;
$$;

-- 4) Backfill historical cumulative top-up for existing helpers
--    Sum of credited swift_pay_topups per helper.
UPDATE public.topup_helpers th
   SET total_level_upgrade_cost = sub.total_usd
  FROM (
    SELECT target_helper_id, SUM(COALESCE(price_usd, 0))::numeric AS total_usd
      FROM public.swift_pay_topups
     WHERE target_type = 'helper_wallet'
       AND status = 'credited'
       AND target_helper_id IS NOT NULL
     GROUP BY target_helper_id
  ) sub
 WHERE th.id = sub.target_helper_id
   AND COALESCE(th.total_level_upgrade_cost, 0) < sub.total_usd;

-- 5) Force-recalculate trader_level for every helper using backfilled totals
UPDATE public.topup_helpers
   SET total_level_upgrade_cost = total_level_upgrade_cost
 WHERE total_level_upgrade_cost IS NOT NULL;
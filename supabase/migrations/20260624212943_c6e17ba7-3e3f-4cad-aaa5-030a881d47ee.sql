-- CSA Withdrawal Bonus System
-- When agency withdrawal completes in a CSA-served country,
-- CSA earns bonus diamonds = usd_amount * bonus_rate% * diamonds_per_usd
-- Atomic, idempotent, server-authoritative.

-- 1. Add bonus config to settings
ALTER TABLE public.csa_diamond_settings
  ADD COLUMN IF NOT EXISTS withdrawal_bonus_rate_percent numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS withdrawal_bonus_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bonus_trigger_status text NOT NULL DEFAULT 'approved';

-- 2. Track withdrawal source in ledger for idempotency + audit
ALTER TABLE public.csa_diamond_ledger
  ADD COLUMN IF NOT EXISTS related_withdrawal_id uuid,
  ADD COLUMN IF NOT EXISTS bonus_source_usd numeric,
  ADD COLUMN IF NOT EXISTS bonus_rate_applied numeric;

-- Unique index — same withdrawal can NEVER credit twice
CREATE UNIQUE INDEX IF NOT EXISTS uq_csa_ledger_withdrawal_bonus
  ON public.csa_diamond_ledger(related_withdrawal_id)
  WHERE related_withdrawal_id IS NOT NULL AND reason = 'withdrawal_bonus';

-- Track lifetime bonus on CSA row
ALTER TABLE public.country_super_admins
  ADD COLUMN IF NOT EXISTS total_bonus_diamonds bigint NOT NULL DEFAULT 0;

-- 3. Core RPC — award bonus atomically
CREATE OR REPLACE FUNCTION public.award_csa_withdrawal_bonus(_withdrawal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w_row public.agency_withdrawals;
  s_row public.csa_diamond_settings;
  csa_row public.country_super_admins;
  v_bonus_diamonds bigint;
  v_balance_after bigint;
  v_existing_id uuid;
BEGIN
  SELECT * INTO s_row FROM public.csa_diamond_settings WHERE id = 1;
  IF NOT s_row.withdrawal_bonus_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'bonus_disabled');
  END IF;

  SELECT * INTO w_row FROM public.agency_withdrawals WHERE id = _withdrawal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'withdrawal_not_found');
  END IF;

  IF w_row.status IS DISTINCT FROM s_row.bonus_trigger_status THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'status_mismatch', 'current', w_row.status);
  END IF;

  IF COALESCE(w_row.usd_amount, 0) <= 0 OR w_row.country_code IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_usd_or_country');
  END IF;

  -- Idempotency check
  SELECT id INTO v_existing_id FROM public.csa_diamond_ledger
    WHERE related_withdrawal_id = _withdrawal_id AND reason = 'withdrawal_bonus';
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_credited', 'ledger_id', v_existing_id);
  END IF;

  -- Find active CSA for that country
  SELECT * INTO csa_row FROM public.country_super_admins
    WHERE country_code = w_row.country_code
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_active_csa', 'country', w_row.country_code);
  END IF;

  -- Compute bonus: usd * rate% * diamonds_per_usd
  v_bonus_diamonds := FLOOR(
    w_row.usd_amount * (s_row.withdrawal_bonus_rate_percent / 100.0) * s_row.diamonds_per_usd
  )::bigint;

  IF v_bonus_diamonds <= 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'zero_bonus');
  END IF;

  -- Credit atomically
  UPDATE public.country_super_admins
  SET diamond_balance = diamond_balance + v_bonus_diamonds,
      total_bonus_diamonds = total_bonus_diamonds + v_bonus_diamonds,
      updated_at = now()
  WHERE id = csa_row.id
  RETURNING diamond_balance INTO v_balance_after;

  INSERT INTO public.csa_diamond_ledger
    (csa_user_id, country_code, change_amount, balance_after, reason,
     related_withdrawal_id, bonus_source_usd, bonus_rate_applied, notes)
  VALUES
    (csa_row.user_id, csa_row.country_code, v_bonus_diamonds, v_balance_after,
     'withdrawal_bonus', _withdrawal_id, w_row.usd_amount, s_row.withdrawal_bonus_rate_percent,
     format('Auto-bonus: $%s withdrawal @ %s%%', w_row.usd_amount, s_row.withdrawal_bonus_rate_percent));

  -- Notify CSA
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (csa_row.user_id, 'csa_bonus',
      format('🎁 Bonus +%s 💎', v_bonus_diamonds),
      format('You earned %s diamonds (%s%% of $%s withdrawal in %s).',
        v_bonus_diamonds, s_row.withdrawal_bonus_rate_percent, w_row.usd_amount, w_row.country_code),
      jsonb_build_object('withdrawal_id', _withdrawal_id, 'diamonds', v_bonus_diamonds));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'credited', true,
    'csa_user_id', csa_row.user_id,
    'diamonds_awarded', v_bonus_diamonds,
    'new_balance', v_balance_after,
    'usd_source', w_row.usd_amount,
    'rate_pct', s_row.withdrawal_bonus_rate_percent
  );
END $$;

GRANT EXECUTE ON FUNCTION public.award_csa_withdrawal_bonus(uuid) TO authenticated, service_role;

-- 4. Trigger on agency_withdrawals — fire when status transitions to bonus_trigger_status
CREATE OR REPLACE FUNCTION public.trg_csa_award_bonus_on_withdrawal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trigger_status text;
BEGIN
  SELECT bonus_trigger_status INTO v_trigger_status FROM public.csa_diamond_settings WHERE id = 1;
  IF NEW.status = v_trigger_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.award_csa_withdrawal_bonus(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS csa_award_bonus_on_withdrawal ON public.agency_withdrawals;
CREATE TRIGGER csa_award_bonus_on_withdrawal
  AFTER INSERT OR UPDATE OF status ON public.agency_withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.trg_csa_award_bonus_on_withdrawal();

-- 5. Manual replay (owner-only) — backfill any missed withdrawals
CREATE OR REPLACE FUNCTION public.admin_backfill_csa_bonuses(_country text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total int := 0;
  v_credited int := 0;
  w record;
  res jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR w IN
    SELECT id FROM public.agency_withdrawals
    WHERE status = (SELECT bonus_trigger_status FROM public.csa_diamond_settings WHERE id = 1)
      AND (_country IS NULL OR country_code = _country)
  LOOP
    v_total := v_total + 1;
    res := public.award_csa_withdrawal_bonus(w.id);
    IF (res->>'credited')::boolean IS TRUE THEN v_credited := v_credited + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('scanned', v_total, 'credited', v_credited);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_backfill_csa_bonuses(text) TO authenticated;

-- 6. Update summary RPC with bonus stats
CREATE OR REPLACE FUNCTION public.csa_my_diamond_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'balance', csa.diamond_balance,
    'total_purchased', csa.total_purchased_diamonds,
    'total_spent', csa.total_spent_diamonds,
    'total_bonus', csa.total_bonus_diamonds,
    'bonus_this_month', COALESCE((
      SELECT SUM(change_amount) FROM public.csa_diamond_ledger
      WHERE csa_user_id = csa.user_id
        AND reason = 'withdrawal_bonus'
        AND created_at >= date_trunc('month', now())
    ), 0),
    'bonus_usd_this_month', COALESCE((
      SELECT SUM(bonus_source_usd) FROM public.csa_diamond_ledger
      WHERE csa_user_id = csa.user_id
        AND reason = 'withdrawal_bonus'
        AND created_at >= date_trunc('month', now())
    ), 0),
    'country_code', csa.country_code,
    'visibility_now', public.csa_get_country_payment_visibility(csa.country_code),
    'settings', (SELECT row_to_json(s) FROM public.csa_diamond_settings s WHERE id = 1)
  ) INTO v
  FROM public.country_super_admins csa
  WHERE csa.user_id = auth.uid() AND csa.is_active = true
    AND (csa.expires_at IS NULL OR csa.expires_at > now());
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.csa_my_diamond_summary() TO authenticated;
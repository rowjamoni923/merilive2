-- Bug #2: Recharge campaign dedup + first-recharge-only enforcement

ALTER TABLE public.swift_pay_topups
  ADD COLUMN IF NOT EXISTS campaign_id uuid;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'swift_pay_topups_campaign_id_fkey') THEN
    ALTER TABLE public.swift_pay_topups
      ADD CONSTRAINT swift_pay_topups_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.recharge_campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_swift_pay_topups_campaign_id
  ON public.swift_pay_topups(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.user_has_any_completed_recharge(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.swift_pay_topups
       WHERE user_id = p_user_id AND status = 'credited'
    )
    OR EXISTS (
      SELECT 1 FROM public.recharge_transactions
       WHERE user_id = p_user_id
         AND status = 'completed'
         AND COALESCE(coins_received, coins_amount, 0) > 0
    );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_any_completed_recharge(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_campaign_for_user(
  p_user_id uuid,
  p_campaign_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.recharge_campaigns%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_c FROM public.recharge_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_not_found');
  END IF;
  IF COALESCE(v_c.is_active, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_inactive');
  END IF;
  IF v_c.schedule_start IS NOT NULL AND p_at < v_c.schedule_start THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_not_started');
  END IF;
  IF v_c.schedule_end IS NOT NULL AND p_at > v_c.schedule_end THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_expired');
  END IF;

  IF COALESCE(v_c.is_first_recharge_only, false) = true THEN
    IF public.user_has_any_completed_recharge(p_user_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'first_recharge_only_already_used');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_campaign_views
     WHERE user_id = p_user_id AND campaign_id = p_campaign_id AND is_redeemed = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_already_redeemed');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'base_coins', COALESCE(v_c.diamonds_amount, 0),
    'bonus_coins', COALESCE(v_c.bonus_diamonds, 0),
    'price_usd', COALESCE(v_c.offer_price_usd, v_c.original_price_usd)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_campaign_for_user(uuid, uuid, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_swift_pay_mark_campaign_redeemed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'credited'
     AND COALESCE(OLD.status, '') <> 'credited'
     AND NEW.campaign_id IS NOT NULL THEN
    INSERT INTO public.user_campaign_views (user_id, campaign_id, is_redeemed, redeemed_at)
    VALUES (NEW.user_id, NEW.campaign_id, true, now())
    ON CONFLICT (user_id, campaign_id) DO UPDATE
      SET is_redeemed = true,
          redeemed_at = COALESCE(public.user_campaign_views.redeemed_at, EXCLUDED.redeemed_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS swift_pay_mark_campaign_redeemed ON public.swift_pay_topups;
CREATE TRIGGER swift_pay_mark_campaign_redeemed
  AFTER UPDATE OF status ON public.swift_pay_topups
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_swift_pay_mark_campaign_redeemed();

-- Ensure vip_tiers.id has a primary key so it can be referenced by FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.vip_tiers'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.vip_tiers ADD CONSTRAINT vip_tiers_pkey PRIMARY KEY (id);
  END IF;
END$$;

ALTER TABLE public.vip_tiers
  ADD COLUMN IF NOT EXISTS subscription_type text NOT NULL DEFAULT 'standard';

COMMENT ON COLUMN public.vip_tiers.subscription_type IS 'standard | noble — filters VIP vs Noble plan grids in apps.';

CREATE OR REPLACE VIEW public.vip_plans AS
SELECT * FROM public.vip_tiers;

GRANT SELECT ON public.vip_plans TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.vip_perks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.vip_tiers (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vip_perks_plan ON public.vip_perks (plan_id, display_order);

ALTER TABLE public.vip_perks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vip_perks_select_active" ON public.vip_perks;
CREATE POLICY "vip_perks_select_active"
  ON public.vip_perks
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "vip_perks_admin_all" ON public.vip_perks;
CREATE POLICY "vip_perks_admin_all"
  ON public.vip_perks
  FOR ALL
  TO authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE OR REPLACE FUNCTION public.process_vip_subscription(
  p_plan_id uuid,
  p_billing text DEFAULT 'monthly',
  p_equip_updates jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_tier record;
  v_price integer;
  v_days integer;
  v_level integer;
  bill text := lower(trim(coalesce(p_billing, 'monthly')));
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_tier
  FROM public.vip_tiers
  WHERE id = p_plan_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'plan_not_found');
  END IF;

  v_level := COALESCE(v_tier.tier_level, 1);

  IF bill = 'yearly' THEN
    v_price := COALESCE(
      NULLIF(v_tier.price_yearly::integer, 0),
      (COALESCE(NULLIF(v_tier.price_diamonds::integer, 0), v_tier.price_monthly::integer, 0) * 10)
    );
    v_days := 365;
  ELSE
    v_price := COALESCE(
      NULLIF(v_tier.price_diamonds::integer, 0),
      NULLIF(v_tier.price_monthly::integer, 0),
      0
    );
    v_days := COALESCE(v_tier.duration_days, 30);
  END IF;

  IF v_price <= 0 OR v_days <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_price_or_duration');
  END IF;

  RETURN public.purchase_vip_tier(
    uid,
    p_plan_id,
    v_price,
    v_level,
    v_days,
    coalesce(p_equip_updates, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_vip_subscription(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_vip_subscription(uuid, text, jsonb) TO authenticated;
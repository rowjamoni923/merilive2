
-- =========================================================================
-- STEP 1: Clean overlapping / zero-reward rows in leaderboard_reward_config
-- =========================================================================

-- Delete zero-reward rows (they don't award anything; they only cause overlap noise).
DELETE FROM public.leaderboard_reward_config
WHERE COALESCE(reward_beans,0) + COALESCE(reward_coins,0) + COALESCE(reward_diamonds,0) = 0;

-- Delete the messy host_earnings/daily overlap set (1-2, 2-3, 1-10 duplicates) and
-- reseed the canonical 6-tier layout matching monthly/weekly structure.
DELETE FROM public.leaderboard_reward_config
WHERE category = 'host_earnings' AND period_type = 'daily';

INSERT INTO public.leaderboard_reward_config
  (category, period_type, rank_from, rank_to, reward_beans, reward_coins, reward_diamonds, is_active)
VALUES
  ('host_earnings','daily',1,1,25000,0,0,true),
  ('host_earnings','daily',2,2,15000,0,0,true),
  ('host_earnings','daily',3,3,10000,0,0,true),
  ('host_earnings','daily',4,10,5000,0,0,true),
  ('host_earnings','daily',11,25,2500,0,0,true),
  ('host_earnings','daily',26,50,1000,0,0,true);

-- =========================================================================
-- STEP 2: Prevent future overlaps at the DB level
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Drop any prior version to keep migration idempotent
ALTER TABLE public.leaderboard_reward_config
  DROP CONSTRAINT IF EXISTS leaderboard_reward_config_no_overlap;

ALTER TABLE public.leaderboard_reward_config
  ADD CONSTRAINT leaderboard_reward_config_no_overlap
  EXCLUDE USING gist (
    category    WITH =,
    period_type WITH =,
    int4range(rank_from, rank_to, '[]') WITH &&
  )
  WHERE (is_active = true);

-- =========================================================================
-- STEP 3: Weekly login reward — config table
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.weekly_login_rewards_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reward_type TEXT NOT NULL DEFAULT 'coins' CHECK (reward_type IN ('coins','diamonds','beans')),
  reward_amount BIGINT NOT NULL DEFAULT 500 CHECK (reward_amount > 0),
  label TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.weekly_login_rewards_config TO anon, authenticated;
GRANT ALL ON public.weekly_login_rewards_config TO service_role;

ALTER TABLE public.weekly_login_rewards_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_reward_cfg_read" ON public.weekly_login_rewards_config;
CREATE POLICY "weekly_reward_cfg_read"
  ON public.weekly_login_rewards_config FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "weekly_reward_cfg_admin" ON public.weekly_login_rewards_config;
CREATE POLICY "weekly_reward_cfg_admin"
  ON public.weekly_login_rewards_config FOR ALL
  USING (public.is_active_admin_session()) WITH CHECK (public.is_active_admin_session());

-- Seed one default active row if none exists
INSERT INTO public.weekly_login_rewards_config (reward_type, reward_amount, label, is_active)
SELECT 'coins', 500, 'Weekly Login Bonus', true
WHERE NOT EXISTS (SELECT 1 FROM public.weekly_login_rewards_config WHERE is_active = true);

-- =========================================================================
-- STEP 4: Weekly login claims — one row per user per ISO week
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.weekly_login_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  week_label TEXT NOT NULL,               -- e.g. '2026-W29' (ISO year-week, Asia/Dhaka)
  reward_type TEXT NOT NULL,
  reward_amount BIGINT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_weekly_login_claims_user_week
  ON public.weekly_login_claims (user_id, week_label);

CREATE INDEX IF NOT EXISTS idx_weekly_login_claims_user
  ON public.weekly_login_claims (user_id, claimed_at DESC);

GRANT SELECT, INSERT ON public.weekly_login_claims TO authenticated;
GRANT ALL ON public.weekly_login_claims TO service_role;

ALTER TABLE public.weekly_login_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wlc_own_read" ON public.weekly_login_claims;
CREATE POLICY "wlc_own_read"
  ON public.weekly_login_claims FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wlc_admin_read" ON public.weekly_login_claims;
CREATE POLICY "wlc_admin_read"
  ON public.weekly_login_claims FOR SELECT
  USING (public.is_active_admin_session());

-- Inserts happen only through the SECURITY DEFINER RPC below.

-- =========================================================================
-- STEP 5: RPC — claim_weekly_login_reward (once per ISO week, Asia/Dhaka)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.claim_weekly_login_reward()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_week TEXT;
  v_cfg RECORD;
  v_already BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Asia/Dhaka ISO year-week label, e.g. '2026-W29'
  v_week := to_char((now() AT TIME ZONE 'Asia/Dhaka')::date, 'IYYY"-W"IW');

  SELECT * INTO v_cfg
    FROM public.weekly_login_rewards_config
   WHERE is_active = true
   ORDER BY updated_at DESC
   LIMIT 1;

  IF v_cfg IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_configured');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.weekly_login_claims
     WHERE user_id = v_uid AND week_label = v_week
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed', 'week_label', v_week);
  END IF;

  -- Insert claim FIRST — unique index guarantees no double-credit even under race.
  BEGIN
    INSERT INTO public.weekly_login_claims (user_id, week_label, reward_type, reward_amount)
    VALUES (v_uid, v_week, v_cfg.reward_type, v_cfg.reward_amount);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed', 'week_label', v_week);
  END;

  -- Credit the wallet
  IF v_cfg.reward_type = 'coins' THEN
    UPDATE public.profiles SET coins = COALESCE(coins,0) + v_cfg.reward_amount WHERE id = v_uid;
  ELSIF v_cfg.reward_type = 'diamonds' THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds,0) + v_cfg.reward_amount WHERE id = v_uid;
  ELSIF v_cfg.reward_type = 'beans' THEN
    UPDATE public.profiles SET beans = COALESCE(beans,0) + v_cfg.reward_amount WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'week_label', v_week,
    'reward_type', v_cfg.reward_type,
    'reward_amount', v_cfg.reward_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_weekly_login_reward() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_weekly_login_reward() TO authenticated, service_role;

-- =========================================================================
-- STEP 6: updated_at trigger for the new config table
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS weekly_login_rewards_config_touch ON public.weekly_login_rewards_config;
CREATE TRIGGER weekly_login_rewards_config_touch
  BEFORE UPDATE ON public.weekly_login_rewards_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

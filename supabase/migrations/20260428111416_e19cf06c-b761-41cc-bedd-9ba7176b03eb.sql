
-- ============================================================
-- PHASE 1: VIP & NOBLE SYSTEM — DATABASE FOUNDATION
-- ============================================================

-- ----- 1. Extend vip_tiers with industry-standard privilege fields -----
ALTER TABLE public.vip_tiers
  ADD COLUMN IF NOT EXISTS anti_kick_protection BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_kick_tier_level INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stealth_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_real_level BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forbidden_words_bypass BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_name_changes_per_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recharge_bonus_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_free_diamonds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entry_effect_duration_seconds INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS username_color TEXT,
  ADD COLUMN IF NOT EXISTS profile_background_url TEXT,
  ADD COLUMN IF NOT EXISTS top_position_in_lists BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vip_only_lounge_access BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_random_match BOOLEAN NOT NULL DEFAULT false;

-- ----- 2. Noble Cards (Baron → King monthly subscription ranks) -----
CREATE TABLE IF NOT EXISTS public.noble_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_code TEXT NOT NULL UNIQUE,
  rank_name TEXT NOT NULL,
  rank_order INTEGER NOT NULL DEFAULT 0,
  monthly_diamond_cost INTEGER NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  badge_url TEXT,
  crown_url TEXT,
  entrance_animation_url TEXT,
  entry_effect_duration_seconds INTEGER NOT NULL DEFAULT 10,
  badge_color TEXT,
  description TEXT,
  -- privileges
  cashback_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  monthly_free_diamonds INTEGER NOT NULL DEFAULT 0,
  daily_free_diamonds INTEGER NOT NULL DEFAULT 0,
  recharge_bonus_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  anti_kick_protection BOOLEAN NOT NULL DEFAULT true,
  stealth_mode BOOLEAN NOT NULL DEFAULT true,
  hide_real_level BOOLEAN NOT NULL DEFAULT true,
  forbidden_words_bypass BOOLEAN NOT NULL DEFAULT false,
  exclusive_emoji_pack BOOLEAN NOT NULL DEFAULT true,
  vip_only_lounge_access BOOLEAN NOT NULL DEFAULT true,
  priority_random_match BOOLEAN NOT NULL DEFAULT true,
  top_position_in_lists BOOLEAN NOT NULL DEFAULT true,
  free_name_changes_per_month INTEGER NOT NULL DEFAULT 1,
  custom_chat_bubble_url TEXT,
  custom_avatar_frame_url TEXT,
  username_color TEXT,
  profile_background_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.noble_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active noble cards"
  ON public.noble_cards FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admin session full access on noble_cards"
  ON public.noble_cards FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- ----- 3. User Noble Subscriptions (monthly recurring) -----
CREATE TABLE IF NOT EXISTS public.user_noble_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  noble_card_id UUID NOT NULL REFERENCES public.noble_cards(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_renew BOOLEAN NOT NULL DEFAULT false,
  diamonds_spent INTEGER NOT NULL DEFAULT 0,
  last_reminder_sent_at TIMESTAMPTZ,
  reminders_sent JSONB NOT NULL DEFAULT '[]'::jsonb,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uns_user_active ON public.user_noble_subscriptions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_uns_expires ON public.user_noble_subscriptions(expires_at) WHERE is_active = true;

ALTER TABLE public.user_noble_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own noble subscriptions"
  ON public.user_noble_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admin session full access on user_noble_subscriptions"
  ON public.user_noble_subscriptions FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- ----- 4. VIP Medals (achievement badges) -----
CREATE TABLE IF NOT EXISTS public.vip_medals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medal_code TEXT NOT NULL UNIQUE,
  medal_name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  animation_url TEXT,
  rarity TEXT NOT NULL DEFAULT 'common', -- common/rare/epic/legendary
  criteria_type TEXT, -- e.g. 'total_recharge', 'days_active', 'gifts_sent', 'manual'
  criteria_value BIGINT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vip_medals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active medals"
  ON public.vip_medals FOR SELECT USING (is_active = true);

CREATE POLICY "Admin session full access on vip_medals"
  ON public.vip_medals FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- ----- 5. User VIP Medals (awarded) -----
CREATE TABLE IF NOT EXISTS public.user_vip_medals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  medal_id UUID NOT NULL REFERENCES public.vip_medals(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  awarded_by UUID,
  is_displayed BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id, medal_id)
);

CREATE INDEX IF NOT EXISTS idx_uvm_user ON public.user_vip_medals(user_id);

ALTER TABLE public.user_vip_medals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own medals"
  ON public.user_vip_medals FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Public read displayed medals"
  ON public.user_vip_medals FOR SELECT USING (is_displayed = true);

CREATE POLICY "Admin session full access on user_vip_medals"
  ON public.user_vip_medals FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- ----- 6. Daily Rewards Claim Log (idempotent) -----
CREATE TABLE IF NOT EXISTS public.vip_daily_rewards_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_type TEXT NOT NULL, -- 'vip_tier' | 'noble_card'
  source_id UUID,
  diamonds_awarded INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_date, source_type)
);

CREATE INDEX IF NOT EXISTS idx_vdrl_user_date ON public.vip_daily_rewards_log(user_id, claim_date);

ALTER TABLE public.vip_daily_rewards_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own claims"
  ON public.vip_daily_rewards_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin session full access on vip_daily_rewards_log"
  ON public.vip_daily_rewards_log FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- ----- 7. Recharge Bonus Log -----
CREATE TABLE IF NOT EXISTS public.vip_recharge_bonus_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  recharge_id UUID,
  base_diamonds INTEGER NOT NULL,
  bonus_percent NUMERIC(5,2) NOT NULL,
  bonus_diamonds INTEGER NOT NULL,
  source_type TEXT NOT NULL, -- 'vip_tier' | 'noble_card'
  source_id UUID,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vrbl_user ON public.vip_recharge_bonus_log(user_id);

ALTER TABLE public.vip_recharge_bonus_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bonus log"
  ON public.vip_recharge_bonus_log FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin session full access on vip_recharge_bonus_log"
  ON public.vip_recharge_bonus_log FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- ----- 8. Updated_at triggers -----
CREATE TRIGGER trg_noble_cards_updated_at
  BEFORE UPDATE ON public.noble_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_uns_updated_at
  BEFORE UPDATE ON public.user_noble_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_vip_medals_updated_at
  BEFORE UPDATE ON public.vip_medals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----- 9. Auto-expire noble subscriptions function -----
CREATE OR REPLACE FUNCTION public.expire_noble_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE public.user_noble_subscriptions
  SET is_active = false,
      updated_at = now()
  WHERE is_active = true
    AND expires_at <= now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- ----- 10. Get user's active noble rank (for app queries) -----
CREATE OR REPLACE FUNCTION public.get_user_active_noble(_user_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  noble_card_id UUID,
  rank_code TEXT,
  rank_name TEXT,
  rank_order INTEGER,
  badge_url TEXT,
  crown_url TEXT,
  entrance_animation_url TEXT,
  expires_at TIMESTAMPTZ,
  days_remaining INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    nc.id,
    nc.rank_code,
    nc.rank_name,
    nc.rank_order,
    nc.badge_url,
    nc.crown_url,
    nc.entrance_animation_url,
    s.expires_at,
    GREATEST(0, EXTRACT(DAY FROM (s.expires_at - now()))::INTEGER) AS days_remaining
  FROM public.user_noble_subscriptions s
  JOIN public.noble_cards nc ON nc.id = s.noble_card_id
  WHERE s.user_id = _user_id
    AND s.is_active = true
    AND s.expires_at > now()
  ORDER BY nc.rank_order DESC
  LIMIT 1;
$$;

-- ----- 11. Seed default Noble ranks (Baron → King) -----
INSERT INTO public.noble_cards (rank_code, rank_name, rank_order, monthly_diamond_cost, badge_color, description, entry_effect_duration_seconds, cashback_percent, monthly_free_diamonds, daily_free_diamonds, recharge_bonus_percent, free_name_changes_per_month, display_order)
VALUES
  ('baron',    'Baron',    1, 1000,  '#8B7355', 'Entry-level noble title with basic privileges',  5,  2, 50,  10, 5,  1, 1),
  ('viscount', 'Viscount', 2, 3000,  '#9B8AA0', 'Mid-tier noble with enhanced visibility',         8,  3, 200, 25, 7,  2, 2),
  ('count',    'Count',    3, 6000,  '#C0A062', 'Distinguished noble with exclusive perks',        12, 5, 500, 50, 10, 3, 3),
  ('marquis',  'Marquis',  4, 12000, '#E8B547', 'Elite noble with premium effects',                15, 7, 1200,100,12, 5, 4),
  ('duke',     'Duke',     5, 30000, '#F5D547', 'High-tier nobility with grand entrance',          20, 10,3000,200,15, 8, 5),
  ('king',     'King',     6, 60000, '#FFD700', 'Supreme noble title with maximum privileges',     25, 15,7000,500,20, 99,6)
ON CONFLICT (rank_code) DO NOTHING;

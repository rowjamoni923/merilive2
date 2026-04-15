
-- =============================================
-- RECHARGE CAMPAIGNS TABLE
-- =============================================
CREATE TABLE public.recharge_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'bonus',
  
  -- Offer details (admin-configurable)
  original_price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  offer_price_usd NUMERIC(10,2),
  diamonds_amount INTEGER NOT NULL DEFAULT 0,
  bonus_diamonds INTEGER NOT NULL DEFAULT 0,
  
  -- Timer
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  
  -- Display
  banner_image_url TEXT,
  badge_text TEXT DEFAULT 'Limited Offer',
  display_locations TEXT[] DEFAULT ARRAY['home','party','reels','chat'],
  
  -- Targeting
  target_audience TEXT NOT NULL DEFAULT 'all',
  is_first_recharge_only BOOLEAN NOT NULL DEFAULT false,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_recharge_campaign()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.campaign_type NOT IN ('bonus', 'discount', 'first_recharge', 'custom') THEN
    RAISE EXCEPTION 'Invalid campaign_type: %', NEW.campaign_type;
  END IF;
  IF NEW.target_audience NOT IN ('all', 'new_users', 'inactive', 'vip') THEN
    RAISE EXCEPTION 'Invalid target_audience: %', NEW.target_audience;
  END IF;
  IF NEW.diamonds_amount < 0 THEN
    RAISE EXCEPTION 'diamonds_amount must be >= 0';
  END IF;
  IF NEW.duration_minutes < 1 THEN
    RAISE EXCEPTION 'duration_minutes must be >= 1';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_recharge_campaign
BEFORE INSERT OR UPDATE ON public.recharge_campaigns
FOR EACH ROW EXECUTE FUNCTION public.validate_recharge_campaign();

-- Updated_at trigger
CREATE TRIGGER update_recharge_campaigns_updated_at
BEFORE UPDATE ON public.recharge_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.recharge_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active campaigns"
ON public.recharge_campaigns FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Admins can do everything with campaigns"
ON public.recharge_campaigns FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- =============================================
-- USER CAMPAIGN VIEWS TABLE
-- =============================================
CREATE TABLE public.user_campaign_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  campaign_id UUID NOT NULL REFERENCES public.recharge_campaigns(id) ON DELETE CASCADE,
  
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  timer_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMPTZ,
  is_redeemed BOOLEAN NOT NULL DEFAULT false,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, campaign_id)
);

-- RLS
ALTER TABLE public.user_campaign_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own campaign views"
ON public.user_campaign_views FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own campaign views"
ON public.user_campaign_views FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaign views"
ON public.user_campaign_views FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all campaign views"
ON public.user_campaign_views FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Indexes
CREATE INDEX idx_recharge_campaigns_active ON public.recharge_campaigns(is_active, priority DESC);
CREATE INDEX idx_user_campaign_views_user ON public.user_campaign_views(user_id);
CREATE INDEX idx_user_campaign_views_campaign ON public.user_campaign_views(campaign_id);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.recharge_campaigns;

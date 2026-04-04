-- VIP Membership Tiers Table
CREATE TABLE public.vip_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_code TEXT NOT NULL UNIQUE,
  tier_name TEXT NOT NULL,
  tier_level INTEGER NOT NULL DEFAULT 1,
  price_diamonds INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER DEFAULT 30,
  badge_url TEXT,
  badge_color TEXT DEFAULT '#FFD700',
  description TEXT,
  
  -- Privileges
  exclusive_frames BOOLEAN DEFAULT false,
  exclusive_entry_bars BOOLEAN DEFAULT false,
  exclusive_gifts BOOLEAN DEFAULT false,
  exclusive_bubbles BOOLEAN DEFAULT false,
  exclusive_stickers BOOLEAN DEFAULT false,
  priority_matching BOOLEAN DEFAULT false,
  ad_free BOOLEAN DEFAULT false,
  faster_support BOOLEAN DEFAULT false,
  vip_only_rooms BOOLEAN DEFAULT false,
  profile_highlight BOOLEAN DEFAULT false,
  
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User VIP Subscriptions Table
CREATE TABLE public.user_vip_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES public.vip_tiers(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  auto_renew BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, tier_id)
);

-- Enable RLS
ALTER TABLE public.vip_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_vip_subscriptions ENABLE ROW LEVEL SECURITY;

-- VIP Tiers Policies (public read)
CREATE POLICY "Anyone can view active VIP tiers"
  ON public.vip_tiers FOR SELECT
  USING (is_active = true);

-- User VIP Subscriptions Policies
CREATE POLICY "Users can view their own VIP subscriptions"
  ON public.user_vip_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own VIP subscriptions"
  ON public.user_vip_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own VIP subscriptions"
  ON public.user_vip_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

-- Insert default VIP tiers
INSERT INTO public.vip_tiers (tier_code, tier_name, tier_level, price_diamonds, duration_days, badge_color, description, exclusive_frames, exclusive_entry_bars, exclusive_gifts, exclusive_bubbles, exclusive_stickers, priority_matching, ad_free, faster_support, vip_only_rooms, profile_highlight, display_order) VALUES
('vip1', 'VIP 1', 1, 5000, 30, '#C0C0C0', 'Silver VIP membership with basic privileges', true, false, false, false, false, false, true, false, false, true, 1),
('vip2', 'VIP 2', 2, 15000, 30, '#FFD700', 'Gold VIP membership with enhanced privileges', true, true, true, false, false, true, true, false, false, true, 2),
('vip3', 'VIP 3', 3, 35000, 30, '#E5E4E2', 'Platinum VIP with premium privileges', true, true, true, true, false, true, true, true, true, true, 3),
('vip4', 'VIP 4', 4, 75000, 30, '#00FFFF', 'Diamond VIP with all exclusive privileges', true, true, true, true, true, true, true, true, true, true, 4),
('vip5', 'VIP 5', 5, 150000, 30, '#FF69B4', 'Royal VIP - Ultimate membership tier', true, true, true, true, true, true, true, true, true, true, 5),
('vip6', 'VIP 6', 6, 300000, 30, '#9400D3', 'Imperial VIP - Legendary status', true, true, true, true, true, true, true, true, true, true, 6);

-- Add VIP tier reference to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS current_vip_tier_id UUID REFERENCES public.vip_tiers(id),
ADD COLUMN IF NOT EXISTS vip_expires_at TIMESTAMPTZ;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_vip_subscriptions_user_id ON public.user_vip_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vip_subscriptions_expires_at ON public.user_vip_subscriptions(expires_at);

-- =============================================
-- PARCEL REWARD SYSTEM - Complete Schema
-- =============================================

-- 1. Parcel Templates (admin-configured)
CREATE TABLE public.parcel_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  parcel_type TEXT NOT NULL DEFAULT 'standard' CHECK (parcel_type IN ('standard', 'mega', 'surprise', 'lucky_spin')),
  
  -- Unlock conditions
  unlock_condition TEXT NOT NULL DEFAULT 'none' CHECK (unlock_condition IN ('none', 'recharge', 'watch_live', 'send_gift', 'daily_login', 'first_recharge', 'level_reach', 'invite_friend')),
  unlock_threshold INTEGER DEFAULT 0,
  
  -- Reward config
  reward_type TEXT NOT NULL DEFAULT 'coins' CHECK (reward_type IN ('coins', 'beans', 'vip_days', 'call_minutes', 'bonus_percentage')),
  reward_amount INTEGER NOT NULL DEFAULT 0,
  reward_label TEXT,
  
  -- Timer config
  expiry_hours INTEGER DEFAULT 24,
  unlock_wait_hours INTEGER DEFAULT 0,
  
  -- Targeting
  target_segment TEXT DEFAULT 'all' CHECK (target_segment IN ('all', 'new_user', 'returning_user', 'vip', 'high_spender', 'inactive')),
  min_level INTEGER DEFAULT 0,
  max_level INTEGER DEFAULT 999,
  
  -- Display
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  glow_color TEXT DEFAULT '#a855f7',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. User Parcels (personalized per user)
CREATE TABLE public.user_parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.parcel_templates(id) ON DELETE CASCADE,
  
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'unlocked', 'opened', 'expired')),
  
  -- Progress tracking
  current_progress INTEGER DEFAULT 0,
  required_progress INTEGER DEFAULT 0,
  
  -- Timers
  assigned_at TIMESTAMPTZ DEFAULT now(),
  unlocks_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  
  -- Actual reward (can differ from template for randomization)
  actual_reward_type TEXT,
  actual_reward_amount INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Parcel Claims Log (audit trail, prevents duplicates)
CREATE TABLE public.parcel_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parcel_id UUID NOT NULL REFERENCES public.user_parcels(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL,
  reward_amount INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(parcel_id)
);

-- Indexes
CREATE INDEX idx_user_parcels_user ON public.user_parcels(user_id, status);
CREATE INDEX idx_user_parcels_expires ON public.user_parcels(expires_at) WHERE status != 'expired';
CREATE INDEX idx_parcel_claims_user ON public.parcel_claims(user_id);

-- RLS
ALTER TABLE public.parcel_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcel_claims ENABLE ROW LEVEL SECURITY;

-- Templates: public read, admin write
CREATE POLICY "Anyone can read active parcel templates" ON public.parcel_templates
  FOR SELECT USING (is_active = true);

-- User parcels: users see own
CREATE POLICY "Users see own parcels" ON public.user_parcels
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Claims: users see own
CREATE POLICY "Users see own claims" ON public.parcel_claims
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- =============================================
-- RPC: Claim a parcel (secure, idempotent)
-- =============================================
CREATE OR REPLACE FUNCTION public.claim_parcel_reward(p_parcel_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parcel RECORD;
  v_result JSONB;
BEGIN
  -- Get and lock the parcel
  SELECT up.*, pt.name as template_name
  INTO v_parcel
  FROM user_parcels up
  JOIN parcel_templates pt ON pt.id = up.template_id
  WHERE up.id = p_parcel_id
    AND up.user_id = auth.uid()
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel not found');
  END IF;
  
  IF v_parcel.status = 'opened' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;
  
  IF v_parcel.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel expired');
  END IF;
  
  IF v_parcel.status = 'locked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel is locked');
  END IF;
  
  -- Check timer
  IF v_parcel.expires_at IS NOT NULL AND v_parcel.expires_at < now() THEN
    UPDATE user_parcels SET status = 'expired' WHERE id = p_parcel_id;
    RETURN jsonb_build_object('success', false, 'error', 'Parcel expired');
  END IF;
  
  IF v_parcel.unlocks_at IS NOT NULL AND v_parcel.unlocks_at > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not yet unlocked');
  END IF;
  
  -- Mark as opened
  UPDATE user_parcels 
  SET status = 'opened', opened_at = now()
  WHERE id = p_parcel_id;
  
  -- Insert claim record
  INSERT INTO parcel_claims (user_id, parcel_id, reward_type, reward_amount)
  VALUES (auth.uid(), p_parcel_id, 
    COALESCE(v_parcel.actual_reward_type, 'coins'),
    COALESCE(v_parcel.actual_reward_amount, 0));
  
  -- Distribute reward
  IF COALESCE(v_parcel.actual_reward_type, 'coins') = 'coins' THEN
    SET LOCAL app.bypass_profile_protection = 'true';
    UPDATE profiles 
    SET coins = coins + COALESCE(v_parcel.actual_reward_amount, 0)
    WHERE id = auth.uid();
  ELSIF v_parcel.actual_reward_type = 'beans' THEN
    SET LOCAL app.bypass_profile_protection = 'true';
    UPDATE profiles 
    SET beans = beans + COALESCE(v_parcel.actual_reward_amount, 0)
    WHERE id = auth.uid();
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 
    'reward_type', COALESCE(v_parcel.actual_reward_type, 'coins'),
    'reward_amount', COALESCE(v_parcel.actual_reward_amount, 0),
    'parcel_name', v_parcel.template_name
  );
END;
$$;

-- =============================================
-- RPC: Generate parcels for a user
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_user_parcels(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_profile RECORD;
  v_existing INT;
BEGIN
  -- Get user profile for segmentation
  SELECT level, is_vip, coins, created_at INTO v_profile
  FROM profiles WHERE id = p_user_id;
  
  FOR v_template IN 
    SELECT * FROM parcel_templates 
    WHERE is_active = true
    ORDER BY display_order
  LOOP
    -- Check if user already has this template assigned (active)
    SELECT COUNT(*) INTO v_existing
    FROM user_parcels 
    WHERE user_id = p_user_id 
      AND template_id = v_template.id 
      AND status IN ('locked', 'unlocked');
    
    IF v_existing > 0 THEN CONTINUE; END IF;
    
    -- Check segment
    IF v_template.target_segment = 'new_user' AND v_profile.created_at < now() - interval '7 days' THEN
      CONTINUE;
    END IF;
    IF v_template.target_segment = 'vip' AND NOT COALESCE(v_profile.is_vip, false) THEN
      CONTINUE;
    END IF;
    IF v_template.min_level > COALESCE(v_profile.level, 1) OR v_template.max_level < COALESCE(v_profile.level, 1) THEN
      CONTINUE;
    END IF;
    
    -- Create parcel
    INSERT INTO user_parcels (
      user_id, template_id, status,
      required_progress, current_progress,
      actual_reward_type, actual_reward_amount,
      unlocks_at, expires_at
    ) VALUES (
      p_user_id, v_template.id,
      CASE WHEN v_template.unlock_condition = 'none' THEN 'unlocked' ELSE 'locked' END,
      v_template.unlock_threshold, 0,
      v_template.reward_type, v_template.reward_amount,
      CASE WHEN v_template.unlock_wait_hours > 0 THEN now() + (v_template.unlock_wait_hours || ' hours')::interval ELSE NULL END,
      CASE WHEN v_template.expiry_hours > 0 THEN now() + (v_template.expiry_hours || ' hours')::interval ELSE NULL END
    );
  END LOOP;
END;
$$;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_parcels;

-- Seed some templates
INSERT INTO public.parcel_templates (name, description, parcel_type, unlock_condition, unlock_threshold, reward_type, reward_amount, reward_label, expiry_hours, unlock_wait_hours, target_segment, display_order, glow_color) VALUES
('Welcome Gift', 'Your first reward! Open now to claim free diamonds.', 'standard', 'none', 0, 'coins', 50, '50 Diamonds', 48, 0, 'new_user', 1, '#ffd700'),
('First Recharge Bonus', 'Recharge once to unlock this premium parcel!', 'standard', 'first_recharge', 1, 'coins', 200, '200 Diamonds', 72, 0, 'all', 2, '#a855f7'),
('Live Watcher Box', 'Watch 5 minutes of live stream to unlock.', 'standard', 'watch_live', 5, 'coins', 30, '30 Diamonds', 24, 0, 'all', 3, '#ec4899'),
('Gift Sender Reward', 'Send 3 gifts to unlock this parcel.', 'standard', 'send_gift', 3, 'coins', 100, '100 Diamonds', 24, 2, 'all', 4, '#f97316'),
('Daily Streak Box', 'Login for 3 consecutive days to unlock!', 'mega', 'daily_login', 3, 'coins', 150, '150 Diamonds', 0, 0, 'returning_user', 5, '#eab308'),
('Mystery Mega Parcel', 'A surprise mega reward awaits!', 'mega', 'recharge', 5, 'coins', 500, '500 Diamonds', 48, 4, 'high_spender', 6, '#8b5cf6'),
('Lucky Spin Parcel', 'Try your luck with a spin!', 'lucky_spin', 'none', 0, 'coins', 25, '25 Diamonds', 12, 0, 'all', 7, '#06b6d4'),
('VIP Exclusive', 'Special parcel for VIP members only.', 'surprise', 'none', 0, 'coins', 300, '300 Diamonds', 24, 0, 'vip', 8, '#ffd700');

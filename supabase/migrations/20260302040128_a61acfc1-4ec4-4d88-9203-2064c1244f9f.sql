
-- Table for rating reward claims
CREATE TABLE public.rating_reward_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  screenshot_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reward_type TEXT NOT NULL DEFAULT 'beans' CHECK (reward_type IN ('beans', 'diamonds')),
  reward_amount INTEGER NOT NULL DEFAULT 10000,
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One claim per user
CREATE UNIQUE INDEX idx_rating_reward_claims_user ON public.rating_reward_claims(user_id);

-- Enable RLS
ALTER TABLE public.rating_reward_claims ENABLE ROW LEVEL SECURITY;

-- Users can view their own claims
CREATE POLICY "Users can view own rating claims"
ON public.rating_reward_claims FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own claim
CREATE POLICY "Users can submit rating claim"
ON public.rating_reward_claims FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admin can view all claims (via service role or admin check)
CREATE POLICY "Admins can view all rating claims"
ON public.rating_reward_claims FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
);

-- Admin can update claims (approve/reject)
CREATE POLICY "Admins can update rating claims"
ON public.rating_reward_claims FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
);

-- Storage bucket for rating screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('rating-screenshots', 'rating-screenshots', true);

-- Storage policies
CREATE POLICY "Users can upload rating screenshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'rating-screenshots' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view rating screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'rating-screenshots');

-- RPC to approve rating reward and distribute reward
CREATE OR REPLACE FUNCTION public.approve_rating_reward(
  p_claim_id UUID,
  p_admin_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_profile RECORD;
BEGIN
  -- Get claim
  SELECT * INTO v_claim FROM rating_reward_claims WHERE id = p_claim_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim not found or already processed');
  END IF;

  -- Get user profile to determine gender
  SELECT id, gender, display_name INTO v_profile FROM profiles WHERE id = v_claim.user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Determine reward type based on gender
  -- Female (host) = beans, Male = diamonds
  IF v_profile.gender = 'female' THEN
    UPDATE profiles SET beans_balance = COALESCE(beans_balance, 0) + 10000 WHERE id = v_claim.user_id;
    UPDATE rating_reward_claims SET status = 'approved', reward_type = 'beans', reviewed_by = p_admin_id, reviewed_at = now() WHERE id = p_claim_id;
  ELSE
    UPDATE profiles SET diamond_balance = COALESCE(diamond_balance, 0) + 10000 WHERE id = v_claim.user_id;
    UPDATE rating_reward_claims SET status = 'approved', reward_type = 'diamonds', reviewed_by = p_admin_id, reviewed_at = now() WHERE id = p_claim_id;
  END IF;

  -- Send notification
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    v_claim.user_id,
    'reward',
    '🎉 Rating Reward Approved!',
    CASE WHEN v_profile.gender = 'female' 
      THEN 'You received 10,000 Beans for your 5-star rating!'
      ELSE 'You received 10,000 Diamonds for your 5-star rating!'
    END,
    jsonb_build_object('reward_type', CASE WHEN v_profile.gender = 'female' THEN 'beans' ELSE 'diamonds' END, 'amount', 10000)
  );

  RETURN jsonb_build_object('success', true, 'reward_type', CASE WHEN v_profile.gender = 'female' THEN 'beans' ELSE 'diamonds' END, 'amount', 10000);
END;
$$;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.rating_reward_claims;

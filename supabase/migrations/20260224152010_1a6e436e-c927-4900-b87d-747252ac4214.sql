
-- Table to track which invitation reward tiers a user has claimed
CREATE TABLE public.invitation_reward_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES public.invitation_settings(id) ON DELETE CASCADE,
  invite_count_at_claim INTEGER NOT NULL DEFAULT 0,
  beans_awarded INTEGER NOT NULL DEFAULT 0,
  coins_awarded INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, tier_id)
);

ALTER TABLE public.invitation_reward_claims ENABLE ROW LEVEL SECURITY;

-- Users can view their own claims
CREATE POLICY "Users can view own claims"
ON public.invitation_reward_claims
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own claims
CREATE POLICY "Users can claim rewards"
ON public.invitation_reward_claims
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins full access
CREATE POLICY "Admins full access to claims"
ON public.invitation_reward_claims
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Grant permissions
GRANT SELECT, INSERT ON public.invitation_reward_claims TO authenticated;

-- RPC function to claim invitation reward atomically
CREATE OR REPLACE FUNCTION public.claim_invitation_reward(
  p_tier_id UUID,
  p_reward_beans INTEGER,
  p_reward_coins INTEGER,
  p_invite_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_already_claimed BOOLEAN;
  v_actual_invites INTEGER;
  v_tier RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if already claimed
  SELECT EXISTS(
    SELECT 1 FROM invitation_reward_claims 
    WHERE user_id = v_user_id AND tier_id = p_tier_id
  ) INTO v_already_claimed;

  IF v_already_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;

  -- Verify the tier exists and is active
  SELECT * INTO v_tier FROM invitation_settings WHERE id = p_tier_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid tier');
  END IF;

  -- Count actual verified invites
  SELECT COUNT(*) INTO v_actual_invites
  FROM user_invitations
  WHERE inviter_id = v_user_id AND status = 'verified';

  -- Verify user has enough invites
  IF v_actual_invites < v_tier.min_invites THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough invites');
  END IF;

  -- Use the tier's actual reward values (not user-provided)
  -- Award beans
  IF COALESCE(v_tier.reward_beans, 0) > 0 THEN
    UPDATE profiles SET beans = COALESCE(beans, 0) + v_tier.reward_beans WHERE id = v_user_id;
  END IF;

  -- Award coins
  IF COALESCE(v_tier.reward_coins, 0) > 0 THEN
    UPDATE profiles SET coins = COALESCE(coins, 0) + v_tier.reward_coins WHERE id = v_user_id;
  END IF;

  -- Record the claim
  INSERT INTO invitation_reward_claims (user_id, tier_id, invite_count_at_claim, beans_awarded, coins_awarded)
  VALUES (v_user_id, p_tier_id, v_actual_invites, COALESCE(v_tier.reward_beans, 0), COALESCE(v_tier.reward_coins, 0));

  RETURN jsonb_build_object(
    'success', true, 
    'beans_awarded', COALESCE(v_tier.reward_beans, 0), 
    'coins_awarded', COALESCE(v_tier.reward_coins, 0)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.claim_invitation_reward(uuid, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.claim_invitation_reward(
  p_tier_id UUID,
  p_reward_beans INTEGER,
  p_reward_coins INTEGER,
  p_invite_count INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_tier RECORD;
  v_verified_count INTEGER;
  v_already_claimed BOOLEAN;
  v_diamonds_to_add INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_tier FROM invitation_tiers WHERE id = p_tier_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid tier');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM invitation_reward_claims WHERE user_id = v_user_id AND tier_id = p_tier_id
  ) INTO v_already_claimed;

  IF v_already_claimed THEN
    RETURN json_build_object('success', false, 'error', 'Already claimed');
  END IF;

  SELECT COUNT(*) INTO v_verified_count
  FROM invitation_tracking
  WHERE inviter_id = v_user_id AND status = 'verified';

  IF v_verified_count < v_tier.required_invites THEN
    RETURN json_build_object('success', false, 'error', 'Not enough invites');
  END IF;

  -- All invitation rewards go to diamonds (My Diamonds)
  v_diamonds_to_add := COALESCE(p_reward_beans, 0) + COALESCE(p_reward_coins, 0);

  UPDATE profiles
  SET diamonds = COALESCE(diamonds, 0) + v_diamonds_to_add
  WHERE id = v_user_id;

  INSERT INTO invitation_reward_claims (user_id, tier_id, reward_beans, reward_coins)
  VALUES (v_user_id, p_tier_id, p_reward_beans, p_reward_coins);

  RETURN json_build_object(
    'success', true, 
    'diamonds_awarded', v_diamonds_to_add,
    'beans_awarded', 0,
    'coins_awarded', 0
  );
END;
$$;
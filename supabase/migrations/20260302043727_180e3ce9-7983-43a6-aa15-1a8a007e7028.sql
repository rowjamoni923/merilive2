-- Fix approve_rating_reward RPC: Host=10,000 beans, User=5,000 diamonds (based on is_host)
CREATE OR REPLACE FUNCTION public.approve_rating_reward(p_claim_id UUID, p_admin_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_profile RECORD;
  v_reward_type TEXT;
  v_reward_amount INT;
BEGIN
  -- Get claim
  SELECT * INTO v_claim FROM rating_reward_claims WHERE id = p_claim_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim not found or already processed');
  END IF;

  -- Get user profile to determine host status
  SELECT id, is_host, display_name INTO v_profile FROM profiles WHERE id = v_claim.user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Determine reward: Host = 10,000 Beans, User = 5,000 Diamonds
  IF COALESCE(v_profile.is_host, false) THEN
    v_reward_type := 'beans';
    v_reward_amount := 10000;
    UPDATE profiles SET beans_balance = COALESCE(beans_balance, 0) + 10000 WHERE id = v_claim.user_id;
  ELSE
    v_reward_type := 'diamonds';
    v_reward_amount := 5000;
    UPDATE profiles SET diamond_balance = COALESCE(diamond_balance, 0) + 5000 WHERE id = v_claim.user_id;
  END IF;

  -- Update claim record
  UPDATE rating_reward_claims 
  SET status = 'approved', 
      reward_type = v_reward_type, 
      reward_amount = v_reward_amount,
      reviewed_by = p_admin_id, 
      reviewed_at = now() 
  WHERE id = p_claim_id;

  -- Send notification
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    v_claim.user_id,
    'reward',
    '🎉 Rating Reward Approved!',
    CASE WHEN v_reward_type = 'beans' 
      THEN 'You received 10,000 Beans for your 5-star rating!'
      ELSE 'You received 5,000 Diamonds for your 5-star rating!'
    END,
    jsonb_build_object('reward_type', v_reward_type, 'amount', v_reward_amount)
  );

  RETURN jsonb_build_object('success', true, 'reward_type', v_reward_type, 'amount', v_reward_amount);
END;
$$;

-- Insert a "Rate on Play Store" task into daily_tasks (one-time, not daily reset)
INSERT INTO daily_tasks (title, description, task_type, requirement_type, requirement_value, reward_beans, reward_coins, icon_name, icon_color, display_order, is_active, target_audience, show_in_live, duration_hours)
VALUES (
  'Rate on Play Store',
  'Rate us 5 stars on Play Store and upload screenshot to claim your reward!',
  'one_time',
  'play_store_rating',
  1,
  0,
  0,
  'star',
  '#FFD700',
  20,
  true,
  'all',
  false,
  0
);

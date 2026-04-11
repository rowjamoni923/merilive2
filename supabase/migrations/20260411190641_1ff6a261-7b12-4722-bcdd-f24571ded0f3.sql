CREATE OR REPLACE FUNCTION public.claim_daily_login_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _user_id UUID; _last_claim RECORD; _next_day INT; _reward RECORD;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  
  SELECT * INTO _last_claim FROM daily_login_claims WHERE user_id = _user_id ORDER BY claimed_at DESC LIMIT 1;
  IF _last_claim.claimed_at IS NOT NULL AND _last_claim.claimed_at::date = CURRENT_DATE THEN 
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today'); 
  END IF;
  
  IF _last_claim.day_number IS NOT NULL AND _last_claim.claimed_at::date = CURRENT_DATE - 1 THEN 
    _next_day := (_last_claim.day_number % 7) + 1; 
  ELSE 
    _next_day := 1; 
  END IF;
  
  SELECT * INTO _reward FROM daily_login_rewards_config WHERE day_number = _next_day AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Reward config not found'); END IF;
  
  INSERT INTO daily_login_claims (user_id, reward_id, day_number, reward_type, reward_amount) 
  VALUES (_user_id, _reward.id, _next_day, _reward.reward_type, _reward.reward_amount);
  
  -- Bypass profile protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  IF _reward.reward_type = 'coins' THEN 
    UPDATE profiles SET coins = COALESCE(coins, 0) + _reward.reward_amount WHERE id = _user_id;
  ELSIF _reward.reward_type = 'beans' THEN 
    UPDATE profiles SET beans = COALESCE(beans, 0) + _reward.reward_amount WHERE id = _user_id;
  ELSIF _reward.reward_type = 'diamonds' THEN 
    UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _reward.reward_amount WHERE id = _user_id;
  END IF;
  
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  
  -- Update login streak
  INSERT INTO user_login_streaks (user_id, current_streak, last_login_date, total_logins)
  VALUES (_user_id, _next_day, CURRENT_DATE, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    current_streak = _next_day,
    last_login_date = CURRENT_DATE,
    total_logins = user_login_streaks.total_logins + 1;
  
  RETURN jsonb_build_object('success', true, 'day', _next_day, 'reward_type', _reward.reward_type, 
    'reward_amount', _reward.reward_amount,
    'coins', CASE WHEN _reward.reward_type = 'coins' THEN _reward.reward_amount ELSE 0 END,
    'diamonds', CASE WHEN _reward.reward_type = 'diamonds' THEN _reward.reward_amount ELSE 0 END);
END;
$$;
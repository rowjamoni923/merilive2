CREATE OR REPLACE FUNCTION public.claim_daily_login_reward(
  _claimed_date date,
  _day_start timestamp with time zone,
  _day_end timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _existing_claim record;
  _last_claim record;
  _next_day int;
  _reward record;
  _previous_claimed_date date;
BEGIN
  _user_id := auth.uid();

  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _claimed_date IS NULL OR _day_start IS NULL OR _day_end IS NULL OR _day_end <= _day_start THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid app day window');
  END IF;

  SELECT *
  INTO _existing_claim
  FROM public.daily_login_claims
  WHERE user_id = _user_id
    AND (
      claimed_date = _claimed_date
      OR (claimed_at >= _day_start AND claimed_at < _day_end)
    )
  ORDER BY claimed_at DESC
  LIMIT 1;

  IF _existing_claim IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today');
  END IF;

  SELECT *
  INTO _last_claim
  FROM public.daily_login_claims
  WHERE user_id = _user_id
  ORDER BY claimed_at DESC
  LIMIT 1;

  _previous_claimed_date := _claimed_date - INTERVAL '1 day';

  IF _last_claim IS NOT NULL AND (
    _last_claim.claimed_date = _previous_claimed_date
    OR (_last_claim.claimed_at >= (_day_start - INTERVAL '1 day') AND _last_claim.claimed_at < _day_start)
  ) THEN
    _next_day := (COALESCE(_last_claim.day_number, 0) % 7) + 1;
  ELSE
    _next_day := 1;
  END IF;

  SELECT *
  INTO _reward
  FROM public.daily_login_rewards_config
  WHERE day_number = _next_day
    AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward config not found');
  END IF;

  INSERT INTO public.daily_login_claims (
    user_id,
    reward_id,
    day_number,
    reward_type,
    reward_amount,
    claimed_date
  )
  VALUES (
    _user_id,
    _reward.id,
    _next_day,
    _reward.reward_type,
    _reward.reward_amount,
    _claimed_date
  );

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF COALESCE(_reward.reward_type, '') = 'coins' THEN
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + COALESCE(_reward.reward_amount, 0)
    WHERE id = _user_id;
  ELSIF COALESCE(_reward.reward_type, '') = 'beans' THEN
    UPDATE public.profiles
    SET beans = COALESCE(beans, 0) + COALESCE(_reward.reward_amount, 0)
    WHERE id = _user_id;
  ELSIF COALESCE(_reward.reward_type, '') = 'diamonds' THEN
    UPDATE public.profiles
    SET diamonds = COALESCE(diamonds, 0) + COALESCE(_reward.reward_amount, 0)
    WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  INSERT INTO public.user_login_streaks (user_id, current_streak, last_login_date, total_logins)
  VALUES (_user_id, _next_day, _claimed_date, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET current_streak = _next_day,
      last_login_date = _claimed_date,
      total_logins = COALESCE(public.user_login_streaks.total_logins, 0) + 1;

  RETURN jsonb_build_object(
    'success', true,
    'day', _next_day,
    'reward_type', _reward.reward_type,
    'reward_amount', _reward.reward_amount,
    'coins', CASE WHEN COALESCE(_reward.reward_type, '') = 'coins' THEN COALESCE(_reward.reward_amount, 0) ELSE 0 END,
    'diamonds', CASE WHEN COALESCE(_reward.reward_type, '') = 'diamonds' THEN COALESCE(_reward.reward_amount, 0) ELSE 0 END
  );
END;
$$;
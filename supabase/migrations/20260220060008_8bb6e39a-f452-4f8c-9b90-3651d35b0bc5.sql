
-- Fix 1: add_diamonds_to_user was updating coins instead of diamonds!
CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount
  WHERE id = _user_id;
END;
$$;

-- Fix 2: auto_distribute should check hour <= 1 to allow a wider window
CREATE OR REPLACE FUNCTION public.auto_distribute_leaderboard_rewards()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results TEXT := '';
  v_count INTEGER;
  v_now TIMESTAMPTZ := now();
  v_categories TEXT[] := ARRAY['host_earnings', 'game_winners', 'agency_performance', 'top_gifters'];
  v_cat TEXT;
  v_hour INTEGER := EXTRACT(HOUR FROM v_now);
  v_dow INTEGER := EXTRACT(DOW FROM v_now);
  v_day INTEGER := EXTRACT(DAY FROM v_now);
BEGIN
  FOREACH v_cat IN ARRAY v_categories LOOP
    -- Daily: distribute in the first 2 hours of the day (0 or 1)
    IF v_hour <= 1 THEN
      SELECT distribute_period_rewards(v_cat, 'daily') INTO v_count;
      IF v_count > 0 THEN
        v_results := v_results || v_cat || '/daily: ' || v_count || ' winners. ';
      END IF;
    END IF;

    -- Weekly: distribute on Monday (dow=1) in first 2 hours
    IF v_dow = 1 AND v_hour <= 1 THEN
      SELECT distribute_period_rewards(v_cat, 'weekly') INTO v_count;
      IF v_count > 0 THEN
        v_results := v_results || v_cat || '/weekly: ' || v_count || ' winners. ';
      END IF;
    END IF;

    -- Monthly: distribute on 1st in first 2 hours
    IF v_day = 1 AND v_hour <= 1 THEN
      SELECT distribute_period_rewards(v_cat, 'monthly') INTO v_count;
      IF v_count > 0 THEN
        v_results := v_results || v_cat || '/monthly: ' || v_count || ' winners. ';
      END IF;
    END IF;
  END LOOP;

  IF v_results = '' THEN
    v_results := 'No distributions needed at this time.';
  END IF;

  RETURN v_results;
END;
$$;

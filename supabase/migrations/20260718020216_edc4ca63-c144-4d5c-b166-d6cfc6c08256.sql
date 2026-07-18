-- Seed default 6-tier reward ladder (rank 1-50) for every missing (category, period_type)
-- combination in leaderboard_reward_config. Idempotent: only inserts when the combo has zero rows.

DO $$
DECLARE
  v_categories text[] := ARRAY['host_earnings','game_winners','top_gifters','agency_performance'];
  v_periods text[] := ARRAY['daily','weekly','monthly'];
  v_cat text;
  v_period text;
  v_scale numeric;
  v_r1 int; v_r2 int; v_r3 int; v_r410 int; v_r1125 int; v_r2650 int;
BEGIN
  FOREACH v_cat IN ARRAY v_categories LOOP
    FOREACH v_period IN ARRAY v_periods LOOP
      -- Skip if this combo already has any rows
      IF EXISTS (
        SELECT 1 FROM public.leaderboard_reward_config
        WHERE category = v_cat AND period_type = v_period
      ) THEN
        CONTINUE;
      END IF;

      -- Period scale (monthly = 1x, weekly = 0.25x, daily = 0.05x)
      v_scale := CASE v_period
        WHEN 'monthly' THEN 1.0
        WHEN 'weekly'  THEN 0.25
        WHEN 'daily'   THEN 0.05
      END;

      v_r1    := GREATEST(1000, floor(200000 * v_scale)::int);
      v_r2    := GREATEST(600,  floor(120000 * v_scale)::int);
      v_r3    := GREATEST(400,  floor( 80000 * v_scale)::int);
      v_r410  := GREATEST(200,  floor( 40000 * v_scale)::int);
      v_r1125 := GREATEST(100,  floor( 20000 * v_scale)::int);
      v_r2650 := GREATEST(50,   floor( 10000 * v_scale)::int);

      INSERT INTO public.leaderboard_reward_config
        (leaderboard_type, category, period_type, rank_position, rank_from, rank_to,
         reward_type, reward_amount, reward_coins, reward_diamonds, reward_beans, is_active)
      VALUES
        (v_cat, v_cat, v_period, 1,  1,  1,  'coins', 0, 0, 0, v_r1,    true),
        (v_cat, v_cat, v_period, 2,  2,  2,  'coins', 0, 0, 0, v_r2,    true),
        (v_cat, v_cat, v_period, 3,  3,  3,  'coins', 0, 0, 0, v_r3,    true),
        (v_cat, v_cat, v_period, 4,  4,  10, 'coins', 0, 0, 0, v_r410,  true),
        (v_cat, v_cat, v_period, 11, 11, 25, 'coins', 0, 0, 0, v_r1125, true),
        (v_cat, v_cat, v_period, 26, 26, 50, 'coins', 0, 0, 0, v_r2650, true);
    END LOOP;
  END LOOP;
END $$;
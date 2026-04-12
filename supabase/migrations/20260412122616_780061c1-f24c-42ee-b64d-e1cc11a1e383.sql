-- Function: create_helper_order
CREATE OR REPLACE FUNCTION public.create_helper_order(
  _package_id UUID,
  _payment_method TEXT,
  _amount_usd NUMERIC,
  _amount_local NUMERIC,
  _currency_code TEXT DEFAULT 'BDT',
  _country_code TEXT DEFAULT 'BD',
  _payment_proof TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _helper_id UUID;
  _helper_record RECORD;
  _package RECORD;
  _order_id UUID;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  SELECT * INTO _package FROM coin_packages WHERE id = _package_id;
  IF _package IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid package');
  END IF;
  SELECT th.id INTO _helper_id
  FROM topup_helpers th
  WHERE th.is_active = true AND th.is_verified = true
    AND th.wallet_balance >= _package.coins
    AND (th.country_code = _country_code OR _country_code = ANY(th.supported_countries))
  ORDER BY CASE WHEN th.country_code = _country_code THEN 0 ELSE 1 END, th.display_order ASC, th.wallet_balance DESC
  LIMIT 1;
  IF _helper_id IS NULL THEN
    SELECT th.id INTO _helper_id FROM topup_helpers th
    WHERE th.is_active = true AND th.is_verified = true AND th.wallet_balance >= _package.coins
    ORDER BY th.wallet_balance DESC LIMIT 1;
  END IF;
  IF _helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No helper available at the moment');
  END IF;
  INSERT INTO helper_orders (helper_id, user_id, package_id, coin_amount, amount_usd, amount_local, currency_code, payment_method, user_country_code, user_payment_proof, status)
  VALUES (_helper_id, _user_id, _package_id, _package.coins, _amount_usd, _amount_local, _currency_code, _payment_method, _country_code, _payment_proof, 'pending')
  RETURNING id INTO _order_id;
  RETURN json_build_object('success', true, 'order_id', _order_id, 'helper_id', _helper_id, 'message', 'Order created successfully');
END;
$$;

-- Function: distribute_pk_rewards
CREATE OR REPLACE FUNCTION public.distribute_pk_rewards(p_competition_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp RECORD;
  v_entry RECORD;
  v_rank INTEGER := 0;
  v_count INTEGER := 0;
  v_reward_amount INTEGER;
BEGIN
  SELECT * INTO v_comp FROM pk_competitions WHERE id = p_competition_id;
  IF v_comp IS NULL THEN RETURN 0; END IF;
  IF v_comp.status != 'completed' THEN RETURN 0; END IF;
  FOR v_entry IN (
    SELECT pe.user_id, pe.score, pe.rank_position
    FROM pk_entries pe
    WHERE pe.competition_id = p_competition_id
    ORDER BY pe.rank_position ASC
  ) LOOP
    v_rank := v_rank + 1;
    IF v_rank = 1 THEN
      v_reward_amount := COALESCE(v_comp.prize_1st, 0);
    ELSIF v_rank = 2 THEN
      v_reward_amount := COALESCE(v_comp.prize_2nd, 0);
    ELSIF v_rank = 3 THEN
      v_reward_amount := COALESCE(v_comp.prize_3rd, 0);
    ELSE
      v_reward_amount := 0;
    END IF;
    IF v_reward_amount > 0 THEN
      BEGIN
        IF v_comp.prize_type = 'beans' THEN
          PERFORM _internal_add_beans(v_entry.user_id, v_reward_amount);
        ELSE
          PERFORM _internal_add_coins(v_entry.user_id, v_reward_amount);
        END IF;
        INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
          v_entry.user_id, 'pk_reward', '🏆 PK Rank #' || v_rank || '!',
          'You won ' || v_reward_amount || ' ' || COALESCE(v_comp.prize_type, 'diamonds') || ' in PK!',
          jsonb_build_object('competition_id', p_competition_id, 'rank', v_rank, 'reward', v_reward_amount), false);
        v_count := v_count + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'PK reward error: %', SQLERRM;
      END;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Function: exchange_user_beans_to_diamonds
CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(
  _user_id UUID,
  _beans_amount INTEGER,
  _diamonds_reward INTEGER,
  _tier_id TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_beans INTEGER;
  _current_diamonds INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != _user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT beans, coins INTO _current_beans, _current_diamonds FROM profiles WHERE id = _user_id FOR UPDATE;
  IF _current_beans IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  IF _current_beans < _beans_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient beans', 'current_beans', _current_beans);
  END IF;
  SET LOCAL app.bypass_profile_protection = 'true';
  UPDATE profiles SET beans = beans - _beans_amount, coins = COALESCE(coins, 0) + _diamonds_reward WHERE id = _user_id;
  RETURN json_build_object('success', true, 'new_beans', _current_beans - _beans_amount, 'new_diamonds', COALESCE(_current_diamonds, 0) + _diamonds_reward);
END;
$$;

-- Function: finalize_first_minute_earnings
CREATE OR REPLACE FUNCTION public.finalize_first_minute_earnings(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call RECORD;
  v_host_percent NUMERIC;
  v_host_beans INTEGER;
BEGIN
  SELECT * INTO v_call FROM private_calls WHERE id = p_call_id;
  IF v_call IS NULL THEN RETURN; END IF;
  IF v_call.status != 'active' AND v_call.status != 'completed' THEN RETURN; END IF;
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM app_settings WHERE setting_key = 'host_earning_percent'),
    60
  ) INTO v_host_percent;
  v_host_beans := FLOOR(v_call.first_minute_cost * v_host_percent / 100);
  IF v_host_beans > 0 THEN
    SET LOCAL app.bypass_profile_protection = 'true';
    UPDATE profiles SET beans = COALESCE(beans, 0) + v_host_beans WHERE id = v_call.host_id;
    UPDATE private_calls SET host_earnings_amount = COALESCE(host_earnings_amount, 0) + v_host_beans, first_minute_settled = true WHERE id = p_call_id;
  END IF;
END;
$$;

-- Function: find_account_by_face
CREATE OR REPLACE FUNCTION public.find_account_by_face(face_hash_param TEXT)
RETURNS TABLE(user_id UUID, display_name TEXT, avatar_url TEXT, is_deleted BOOLEAN, deletion_scheduled_at TIMESTAMP WITH TIME ZONE)
AS $$
BEGIN
  RETURN QUERY SELECT p.id as user_id, p.display_name, p.avatar_url, p.is_deleted, p.deletion_scheduled_at
  FROM public.profiles p WHERE p.face_hash = face_hash_param AND p.is_host = TRUE LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: find_available_helper
CREATE OR REPLACE FUNCTION public.find_available_helper(user_country TEXT DEFAULT 'BD')
RETURNS TABLE(helper_id UUID, user_id UUID, wallet_balance NUMERIC, country_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT th.id as helper_id, th.user_id, th.wallet_balance, th.country_code
  FROM topup_helpers th
  WHERE th.is_active = true AND th.is_verified = true AND th.wallet_balance > 0
    AND (th.country_code = user_country OR user_country = ANY(th.supported_countries))
  ORDER BY CASE WHEN th.country_code = user_country THEN 0 ELSE 1 END, th.wallet_balance DESC
  LIMIT 10;
END;
$$;

-- Function: fix_excess_weekly_rewards
CREATE OR REPLACE FUNCTION public.fix_excess_weekly_rewards()
RETURNS TABLE(user_id uuid, category text, excess_beans bigint, excess_diamonds bigint, records_deleted bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    WITH ranked AS (
      SELECT h.id, h.user_id, h.category, h.reward_beans, h.reward_diamonds,
        ROW_NUMBER() OVER (PARTITION BY h.user_id, h.category ORDER BY h.sent_at ASC) as rn
      FROM leaderboard_reward_history h WHERE h.period_type = 'weekly'
    ),
    excess_per_user AS (
      SELECT r.user_id, r.category, SUM(r.reward_beans) as sum_beans, SUM(r.reward_diamonds) as sum_diamonds,
        array_agg(r.id) as ids_to_delete, COUNT(*) as cnt
      FROM ranked r WHERE r.rn > 1 GROUP BY r.user_id, r.category
    )
    SELECT * FROM excess_per_user
  LOOP
    IF v_rec.sum_beans > 0 THEN
      UPDATE profiles p SET beans = GREATEST(0, COALESCE(p.beans, 0) - v_rec.sum_beans) WHERE p.id = v_rec.user_id;
    END IF;
    IF v_rec.sum_diamonds > 0 THEN
      UPDATE profiles p SET coins = GREATEST(0, COALESCE(p.coins, 0) - v_rec.sum_diamonds) WHERE p.id = v_rec.user_id;
    END IF;
    DELETE FROM leaderboard_reward_history h WHERE h.id = ANY(v_rec.ids_to_delete);
    user_id := v_rec.user_id;
    category := v_rec.category;
    excess_beans := v_rec.sum_beans;
    excess_diamonds := v_rec.sum_diamonds;
    records_deleted := v_rec.cnt;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

-- Function: game_cashout
CREATE OR REPLACE FUNCTION public.game_cashout(p_user_id UUID, p_bet_id UUID, p_win_amount INTEGER, p_multiplier NUMERIC)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_coins INTEGER;
  v_new_coins INTEGER;
  v_bet_record RECORD;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT coins INTO v_current_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_coins IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  SELECT lgb.*, lgr.game_id INTO v_bet_record
  FROM live_game_bets lgb JOIN live_game_rounds lgr ON lgb.round_id = lgr.id
  WHERE lgb.id = p_bet_id AND lgb.user_id = p_user_id;
  IF v_bet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Bet not found');
  END IF;
  IF v_bet_record.is_processed THEN
    RETURN json_build_object('success', false, 'error', 'Bet already processed');
  END IF;
  v_new_coins := v_current_coins + p_win_amount;
  UPDATE profiles SET coins = v_new_coins WHERE id = p_user_id;
  UPDATE live_game_bets SET is_winner = true, win_amount = p_win_amount, multiplier = p_multiplier, is_processed = true, cashed_out_at = now()
  WHERE id = p_bet_id AND user_id = p_user_id;
  INSERT INTO game_bets (game_id, user_id, bet_amount, bet_type, is_winner, win_amount, multiplier, result)
  VALUES (v_bet_record.game_id, p_user_id, v_bet_record.bet_amount, 'cashout', true, p_win_amount, p_multiplier,
    jsonb_build_object('type', 'cashout', 'multiplier', p_multiplier, 'win_amount', p_win_amount));
  RETURN json_build_object('success', true, 'new_balance', v_new_coins, 'win_amount', p_win_amount, 'multiplier', p_multiplier);
END;
$$;

-- Function: generate_unique_app_uid
CREATE OR REPLACE FUNCTION public.generate_unique_app_uid()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_uid TEXT;
  uid_exists BOOLEAN;
BEGIN
  LOOP
    new_uid := LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0');
    SELECT EXISTS(SELECT 1 FROM profiles WHERE app_uid = new_uid) INTO uid_exists;
    IF NOT uid_exists THEN EXIT; END IF;
  END LOOP;
  RETURN new_uid;
END;
$$;

-- Function: generate_user_parcels
CREATE OR REPLACE FUNCTION public.generate_user_parcels(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_profile RECORD;
  v_existing INT;
BEGIN
  SELECT level, is_vip, coins, created_at INTO v_profile FROM profiles WHERE id = p_user_id;
  FOR v_template IN SELECT * FROM parcel_templates WHERE is_active = true ORDER BY display_order
  LOOP
    SELECT COUNT(*) INTO v_existing FROM user_parcels WHERE user_id = p_user_id AND template_id = v_template.id AND status IN ('locked', 'unlocked');
    IF v_existing > 0 THEN CONTINUE; END IF;
    IF v_template.target_segment = 'new_user' AND v_profile.created_at < now() - interval '7 days' THEN CONTINUE; END IF;
    IF v_template.target_segment = 'vip' AND NOT COALESCE(v_profile.is_vip, false) THEN CONTINUE; END IF;
    IF v_template.min_level > COALESCE(v_profile.level, 1) OR v_template.max_level < COALESCE(v_profile.level, 1) THEN CONTINUE; END IF;
    INSERT INTO user_parcels (user_id, template_id, status, required_progress, current_progress, actual_reward_type, actual_reward_amount, unlocks_at, expires_at)
    VALUES (p_user_id, v_template.id,
      CASE WHEN v_template.unlock_condition = 'none' THEN 'unlocked' ELSE 'locked' END,
      v_template.unlock_threshold, 0, v_template.reward_type, v_template.reward_amount,
      CASE WHEN v_template.unlock_wait_hours > 0 THEN now() + (v_template.unlock_wait_hours || ' hours')::interval ELSE NULL END,
      CASE WHEN v_template.expiry_hours > 0 THEN now() + (v_template.expiry_hours || ' hours')::interval ELSE NULL END);
  END LOOP;
END;
$$;

-- Function: get_accessible_sections
CREATE OR REPLACE FUNCTION public.get_accessible_sections(_user_id UUID)
RETURNS TABLE(section_key TEXT, section_name TEXT, hub_key TEXT, can_edit BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_admin_owner(_user_id) THEN
    RETURN QUERY SELECT s.section_key, s.section_name, s.hub_key, true as can_edit
    FROM public.admin_sections s WHERE s.is_active = true ORDER BY s.display_order;
  ELSE
    RETURN QUERY SELECT s.section_key, s.section_name, s.hub_key, asp.can_edit
    FROM public.admin_users au
    JOIN public.admin_section_permissions asp ON asp.admin_user_id = au.id
    JOIN public.admin_sections s ON s.id = asp.section_id
    WHERE au.user_id = _user_id AND au.is_active = true AND s.is_active = true AND asp.can_view = true
    ORDER BY s.display_order;
  END IF;
END;
$$;

-- Function: get_account_by_device_id
CREATE OR REPLACE FUNCTION public.get_account_by_device_id(p_device_id text)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, gender text, is_host boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT p.id as user_id, p.display_name, p.avatar_url, p.gender, p.is_host
  FROM public.profiles p WHERE p.device_id = p_device_id AND p.is_deleted IS NOT TRUE LIMIT 1;
END;
$$;

-- Function: get_admin_analytics_chart_data
CREATE OR REPLACE FUNCTION public.get_admin_analytics_chart_data(p_days integer DEFAULT 7)
RETURNS TABLE(stat_date date, total_users bigint, daily_active_users bigint, total_streams bigint, total_gifts_sent bigint, total_coins_spent bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.stat_date::date,
    COALESCE(s.total_users, 0)::bigint,
    COALESCE(s.daily_active_users, 0)::bigint,
    COALESCE(s.total_streams, 0)::bigint,
    COALESCE(s.total_gifts_sent, 0)::bigint,
    COALESCE(s.total_coins_spent, 0)::bigint
  FROM admin_stats s
  WHERE s.stat_date >= (CURRENT_DATE - p_days)
  ORDER BY s.stat_date ASC;
END;
$$;

-- Function: get_admin_role
CREATE OR REPLACE FUNCTION public.get_admin_role(_user_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role::text FROM admin_users WHERE user_id = _user_id AND is_active = true LIMIT 1;
$$;

-- Function: update_conversation_timestamp
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- Function: update_game_provider_timestamp
CREATE OR REPLACE FUNCTION public.update_game_provider_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Function: update_group_member_count
CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE groups SET member_count = (SELECT COUNT(*) FROM group_members WHERE group_id = NEW.group_id) WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE groups SET member_count = (SELECT COUNT(*) FROM group_members WHERE group_id = OLD.group_id) WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
END;
$$;

-- Function: update_host_call_earnings
CREATE OR REPLACE FUNCTION public.update_host_call_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.host_earnings_amount > 0 THEN
    SET LOCAL app.bypass_profile_protection = 'true';
    UPDATE profiles SET
      beans = COALESCE(beans, 0) + NEW.host_earnings_amount,
      total_earnings = COALESCE(total_earnings, 0) + NEW.host_earnings_amount,
      weekly_earnings = COALESCE(weekly_earnings, 0) + NEW.host_earnings_amount
    WHERE id = NEW.host_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Function: update_host_earnings_only
CREATE OR REPLACE FUNCTION public.update_host_earnings_only(
  p_host_id uuid,
  p_beans_to_add bigint,
  p_new_total_earnings bigint,
  p_new_host_level integer
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  SET LOCAL app.bypass_profile_protection = 'true';
  UPDATE profiles SET
    beans = COALESCE(beans, 0) + p_beans_to_add,
    total_earnings = p_new_total_earnings,
    host_level = p_new_host_level,
    weekly_earnings = COALESCE(weekly_earnings, 0) + p_beans_to_add
  WHERE id = p_host_id;
END;
$$;

-- Function: exchange_agency_beans_to_diamonds
CREATE OR REPLACE FUNCTION public.exchange_agency_beans_to_diamonds(
  p_agency_id uuid,
  p_beans_to_deduct bigint,
  p_diamonds_to_add bigint,
  p_fee_amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_beans bigint;
  v_current_diamonds bigint;
  v_new_beans bigint;
  v_new_diamonds bigint;
BEGIN
  SELECT COALESCE(beans_balance, 0)::bigint, COALESCE(diamond_balance, 0)::bigint
  INTO v_current_beans, v_current_diamonds
  FROM agencies WHERE id = p_agency_id FOR UPDATE;
  IF v_current_beans IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  IF v_current_beans < p_beans_to_deduct THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient beans balance', 'current_beans', v_current_beans, 'required_beans', p_beans_to_deduct);
  END IF;
  v_new_beans := v_current_beans - p_beans_to_deduct;
  v_new_diamonds := v_current_diamonds + p_diamonds_to_add;
  UPDATE agencies SET beans_balance = v_new_beans, diamond_balance = v_new_diamonds, updated_at = now() WHERE id = p_agency_id;
  INSERT INTO agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount)
  VALUES (p_agency_id, 'exchange', p_beans_to_deduct, p_diamonds_to_add, p_fee_amount);
  RETURN jsonb_build_object('success', true, 'old_beans', v_current_beans, 'new_beans', v_new_beans, 'old_diamonds', v_current_diamonds, 'new_diamonds', v_new_diamonds, 'deducted', p_beans_to_deduct, 'added', p_diamonds_to_add);
END;
$$;

-- Function: update_game_stats (trigger)
CREATE OR REPLACE FUNCTION public.update_game_stats()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE game_providers SET total_plays = COALESCE(total_plays, 0) + 1, updated_at = now() WHERE game_key = NEW.game_key;
  END IF;
  RETURN NEW;
END;
$$;

-- Function: distribute_period_rewards (the main reward distribution function)
CREATE OR REPLACE FUNCTION public.distribute_period_rewards(p_category TEXT, p_period_type TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_period_label TEXT;
  v_count INTEGER := 0;
  v_reward RECORD;
  v_entry RECORD;
  v_rank INTEGER := 0;
  v_already BOOLEAN;
  v_bst_now TIMESTAMP;
  v_bst_today DATE;
  v_reward_amount INTEGER;
BEGIN
  v_bst_now := (now() AT TIME ZONE 'Asia/Dhaka');
  IF v_bst_now::time < '00:30:00'::time THEN
    v_bst_today := (v_bst_now - interval '1 day')::date;
  ELSE
    v_bst_today := v_bst_now::date;
  END IF;

  IF p_period_type = 'daily' THEN
    v_end_date := (v_bst_today::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := to_char(v_bst_today - interval '1 day', 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    DECLARE v_dow INTEGER;
    BEGIN
      v_dow := EXTRACT(ISODOW FROM v_bst_today);
      v_end_date := ((v_bst_today - (v_dow - 1) * interval '1 day')::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
      v_start_date := v_end_date - interval '1 week';
      v_period_label := 'week-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD');
    END;
  ELSIF p_period_type = 'monthly' THEN
    v_end_date := (date_trunc('month', v_bst_today)::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 month';
    v_period_label := 'month-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM');
  ELSE
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM leaderboard_reward_history
    WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label LIMIT 1
  ) INTO v_already;
  IF v_already THEN RETURN 0; END IF;

  -- HOST EARNINGS → BEANS ONLY
  IF p_category = 'host_earnings' THEN
    FOR v_entry IN (
      WITH gift_stats AS (
        SELECT gt.receiver_id AS user_id, SUM(FLOOR(gt.coin_amount * 0.6)) AS total
        FROM gift_transactions gt
        INNER JOIN profiles p ON p.id = gt.receiver_id AND p.is_host = true
        WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
        GROUP BY gt.receiver_id
      ),
      call_stats AS (
        SELECT pc.host_id AS user_id, SUM(pc.host_earnings_amount) AS total
        FROM private_calls pc
        INNER JOIN profiles p ON p.id = pc.host_id AND p.is_host = true
        WHERE pc.created_at >= v_start_date AND pc.created_at < v_end_date AND pc.status = 'completed'
        GROUP BY pc.host_id
      ),
      combined AS (
        SELECT COALESCE(g.user_id, c.user_id) AS user_id,
               COALESCE(g.total, 0) + COALESCE(c.total, 0) AS stat_value
        FROM gift_stats g FULL OUTER JOIN call_stats c ON g.user_id = c.user_id
      )
      SELECT user_id, stat_value FROM combined
      WHERE user_id IS NOT NULL AND stat_value > 0
      ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            PERFORM _internal_add_beans(v_entry.user_id, v_reward_amount);
            INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, 0, 0, v_reward_amount, now());
            INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
              v_entry.user_id, 'reward',
              '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Host Rank #' || v_rank || '!',
              'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Beans!',
              jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_beans', v_reward_amount), false);
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Host reward error: %', SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- GAME WINNERS → DIAMONDS ONLY
  IF p_category = 'game_winners' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gt.user_id, SUM(gt.amount) AS stat_value
      FROM game_transactions gt
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      AND gt.transaction_type = 'win' AND gt.amount > 0
      GROUP BY gt.user_id ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_beans, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            PERFORM _internal_add_coins(v_entry.user_id, v_reward_amount);
            INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, v_reward_amount, 0, 0, now());
            INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
              v_entry.user_id, 'reward',
              '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Game Rank #' || v_rank || '!',
              'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Diamonds!',
              jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Game reward error: %', SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- TOP GIFTERS → DIAMONDS ONLY
  IF p_category = 'top_gifters' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gt.sender_id AS user_id, SUM(gt.coin_amount) AS stat_value
      FROM gift_transactions gt
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      GROUP BY gt.sender_id ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_beans, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            PERFORM _internal_add_coins(v_entry.user_id, v_reward_amount);
            INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, v_reward_amount, 0, 0, now());
            INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
              v_entry.user_id, 'reward',
              '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Gifter Rank #' || v_rank || '!',
              'You ranked #' || v_rank || ' and earned ' || v_reward_amount || ' Diamonds!',
              jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Gifter reward error: %', SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.exchange_agency_beans_to_diamonds(uuid, bigint, bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_user_beans_to_diamonds(uuid, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_helper_order(uuid, text, numeric, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.game_cashout(uuid, uuid, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_available_helper(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_sections(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_chart_data(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_period_rewards(text, text) TO service_role;
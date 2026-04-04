CREATE OR REPLACE FUNCTION public.deduct_helper_wallet(
  _helper_id uuid,
  _amount numeric,
  _update_total_sold boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance NUMERIC;
  _new_balance NUMERIC;
  _helper_user_id uuid;
  _caller uuid;
BEGIN
  _caller := auth.uid();
  
  -- Get helper's user_id to check ownership
  SELECT user_id, wallet_balance INTO _helper_user_id, _current_balance
  FROM topup_helpers
  WHERE id = _helper_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Helper not found');
  END IF;

  -- Allow if caller is the helper themselves OR is an admin
  IF _caller IS NULL OR (_caller != _helper_user_id AND NOT public.is_admin(_caller)) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  _current_balance := COALESCE(_current_balance, 0);

  IF _current_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', _current_balance);
  END IF;

  _new_balance := _current_balance - _amount;

  IF _update_total_sold THEN
    UPDATE topup_helpers 
    SET wallet_balance = _new_balance,
        total_sold = COALESCE(total_sold, 0) + _amount
    WHERE id = _helper_id;
  ELSE
    UPDATE topup_helpers 
    SET wallet_balance = _new_balance
    WHERE id = _helper_id;
  END IF;

  RETURN json_build_object('success', true, 'new_balance', _new_balance, 'deducted', _amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_to_helper_wallet(_helper_id uuid, _amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add to helper wallet';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE topup_helpers 
  SET wallet_balance = COALESCE(wallet_balance, 0) + _amount
  WHERE id = _helper_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Helper not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_game_provider_timestamp()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_sender_level_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ 
DECLARE
  new_consumption NUMERIC;
  new_level INTEGER;
  current_level INTEGER;
BEGIN
  -- Update total_consumption
  UPDATE profiles 
  SET total_consumption = COALESCE(total_consumption, 0) + NEW.coin_amount,
      updated_at = now() 
  WHERE id = NEW.sender_id;

  -- Get updated consumption and current level
  SELECT COALESCE(total_consumption, 0), COALESCE(user_level, 0)
  INTO new_consumption, current_level
  FROM profiles WHERE id = NEW.sender_id;

  -- Recalculate level based on total_consumption
  SELECT level_number INTO new_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= new_consumption
  ORDER BY level_number DESC
  LIMIT 1;

  new_level := COALESCE(new_level, 0);

  -- Update if changed
  IF new_level != current_level THEN
    UPDATE profiles 
    SET user_level = new_level, updated_at = now()
    WHERE id = NEW.sender_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_level_on_coin_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.update_consumption_on_recharge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  UPDATE profiles SET total_recharged = COALESCE(total_recharged, 0) + NEW.amount, updated_at = now() WHERE id = NEW.user_id;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.prevent_negative_agency_balance()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$ BEGIN
  IF NEW.diamond_balance < 0 THEN RAISE EXCEPTION 'Agency balance cannot be negative'; END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.place_game_bet(p_user_id uuid, p_amount integer, p_game_id text, p_game_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;

  SELECT coins INTO v_current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_current_balance);
  END IF;

  v_new_balance := v_current_balance - p_amount;
  UPDATE profiles SET coins = v_new_balance, updated_at = now() WHERE id = p_user_id;

  INSERT INTO game_transactions (user_id, game_id, game_name, transaction_type, amount, balance_before, balance_after, details)
  VALUES (p_user_id, p_game_id, p_game_name, 'bet', p_amount, v_current_balance, v_new_balance, '{\\"action\\": \\"bet_placed\\"}'::jsonb);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'deducted', p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id uuid,
  p_amount integer,
  p_game_id text,
  p_game_name text,
  p_multiplier numeric DEFAULT NULL,
  p_is_jackpot boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount');
  END IF;

  SELECT coins INTO v_current_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new_balance := v_current_balance + p_amount;
  UPDATE profiles SET coins = v_new_balance, updated_at = now() WHERE id = p_user_id;

  INSERT INTO game_transactions (user_id, game_id, game_name, transaction_type, amount, balance_before, balance_after, multiplier, details)
  VALUES (
    p_user_id,
    p_game_id,
    p_game_name,
    CASE WHEN p_is_jackpot THEN 'jackpot' ELSE 'win' END,
    p_amount,
    v_current_balance,
    v_new_balance,
    p_multiplier,
    jsonb_build_object('action', CASE WHEN p_is_jackpot THEN 'jackpot_won' ELSE 'game_won' END)
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'won', p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_coins_from_user(p_user_id UUID, p_amount INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- CRITICAL: Only admins can deduct coins
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT coins INTO v_current_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_current_balance);
  END IF;
  
  v_new_balance := v_current_balance - p_amount;
  
  UPDATE profiles
  SET coins = v_new_balance, updated_at = now()
  WHERE id = p_user_id;

  -- Log the admin action
  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (auth.uid()::text, 'deduct_coins', p_user_id::text, 'user', 
    jsonb_build_object('amount', p_amount, 'previous_balance', v_current_balance, 'new_balance', v_new_balance));
  
  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_host_earnings_leaderboard(p_period_type text DEFAULT 'weekly')
RETURNS TABLE(id uuid, display_name text, app_uid character varying, avatar_url text, country_flag text, host_level integer, user_level integer, frame_id uuid, stat_value bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_start_date timestamptz;
BEGIN
  IF p_period_type = 'daily' THEN v_start_date := date_trunc('day', now());
  ELSIF p_period_type = 'weekly' THEN v_start_date := date_trunc('week', now());
  ELSE v_start_date := date_trunc('month', now()); END IF;

  RETURN QUERY
  WITH gift_earnings AS (
    SELECT gt.receiver_id AS uid, COALESCE(SUM(FLOOR(gt.coin_amount * 0.6)), 0)::bigint AS beans
    FROM gift_transactions gt
    WHERE gt.created_at >= v_start_date 
    GROUP BY gt.receiver_id
  ),
  call_earnings AS (
    -- FIX: Include both 'ended' and 'completed' statuses, use COALESCE for host_earnings_amount/host_earned
    SELECT pc.host_id AS uid, COALESCE(SUM(COALESCE(pc.host_earnings_amount, pc.host_earned, 0)), 0)::bigint AS beans
    FROM private_calls pc
    WHERE pc.created_at >= v_start_date AND pc.status IN ('ended', 'completed', 'connected')
    GROUP BY pc.host_id
  ),
  combined AS (
    SELECT COALESCE(g.uid, c.uid) AS uid, (COALESCE(g.beans, 0) + COALESCE(c.beans, 0))::bigint AS total_beans
    FROM gift_earnings g FULL OUTER JOIN call_earnings c ON g.uid = c.uid
  )
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id,
         cm.total_beans AS stat_value
  FROM combined cm INNER JOIN profiles p ON p.id = cm.uid
  WHERE cm.total_beans > 0 ORDER BY cm.total_beans DESC LIMIT 50;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_game_rankings_leaderboard(p_period_type text DEFAULT 'weekly'::text)
 RETURNS TABLE(id uuid, display_name text, app_uid character varying, avatar_url text, country_flag text, host_level integer, user_level integer, frame_id uuid, stat_value bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_start_date timestamptz;
BEGIN
  IF p_period_type = 'daily' THEN v_start_date := date_trunc('day', now());
  ELSIF p_period_type = 'weekly' THEN v_start_date := date_trunc('week', now());
  ELSE v_start_date := date_trunc('month', now()); END IF;

  RETURN QUERY
  WITH game_stats AS (
    SELECT gt.user_id AS uid, COALESCE(SUM(gt.amount), 0)::bigint AS total_volume
    FROM game_transactions gt 
    WHERE gt.created_at >= v_start_date
    GROUP BY gt.user_id 
    HAVING SUM(gt.amount) > 0
  )
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id,
         gs.total_volume AS stat_value
  FROM game_stats gs INNER JOIN profiles p ON p.id = gs.uid
  ORDER BY gs.total_volume DESC LIMIT 50;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_top_gifters_leaderboard(p_period_type text DEFAULT 'weekly')
RETURNS TABLE(id uuid, display_name text, app_uid varchar, avatar_url text, country_flag text, host_level int4, user_level int4, frame_id uuid, stat_value bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_start_date timestamptz;
BEGIN
  IF p_period_type = 'daily' THEN v_start_date := date_trunc('day', now());
  ELSIF p_period_type = 'weekly' THEN v_start_date := date_trunc('week', now());
  ELSE v_start_date := date_trunc('month', now()); END IF;

  RETURN QUERY
  WITH gifter_stats AS (
    SELECT gt.sender_id AS uid, COALESCE(SUM(gt.coin_amount), 0)::bigint AS total_sent
    FROM gift_transactions gt WHERE gt.created_at >= v_start_date
    GROUP BY gt.sender_id HAVING SUM(gt.coin_amount) > 0
  )
  SELECT p.id, p.display_name, p.app_uid, p.avatar_url, p.country_flag, p.host_level, p.user_level, p.frame_id,
         gs.total_sent AS stat_value
  FROM gifter_stats gs INNER JOIN profiles p ON p.id = gs.uid
  ORDER BY gs.total_sent DESC LIMIT 50;
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '5s'
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  UPDATE live_streams
  SET is_active = false, ended_at = now()
  WHERE is_active = true
    AND last_heartbeat < now() - interval '60 seconds';
  
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stream_heartbeat(stream_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE live_streams
  SET last_heartbeat = now()
  WHERE id = stream_id 
    AND is_active = true
    AND host_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_new_host_live_bonus(p_user_id uuid, p_hours integer DEFAULT 1)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_settings RECORD;
  v_profile RECORD;
  v_progress RECORD;
  v_host_verified_at TIMESTAMP;
  v_days_since_verified INTEGER;
  v_today_text TEXT := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  v_day_number INTEGER;
  v_new_hours INTEGER;
  v_beans_to_add INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_settings FROM new_host_live_bonus_settings WHERE is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Bonus system is not active');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.is_host IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Not a verified host');
  END IF;

  IF v_profile.is_face_verified IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Host must be face verified');
  END IF;

  v_host_verified_at := COALESCE(v_profile.host_verified_at, v_profile.created_at);
  v_days_since_verified := EXTRACT(DAY FROM (now() - v_host_verified_at))::INTEGER;
  
  IF v_days_since_verified >= v_settings.eligible_days THEN
    RETURN json_build_object('success', false, 'error', 'Eligibility period expired', 'days_since', v_days_since_verified);
  END IF;

  v_day_number := v_days_since_verified + 1;

  SELECT * INTO v_progress FROM new_host_live_bonus_progress 
    WHERE user_id = p_user_id AND bonus_date = v_today_text FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO new_host_live_bonus_progress (user_id, bonus_date, hours_completed, beans_earned, day_number)
    VALUES (p_user_id, v_today_text, 0, 0, v_day_number)
    RETURNING * INTO v_progress;
  END IF;

  IF v_progress.hours_completed >= v_settings.max_hours_per_day THEN
    RETURN json_build_object('success', false, 'error', 'Max hours reached today', 'hours', v_progress.hours_completed);
  END IF;

  v_new_hours := LEAST(p_hours, v_settings.max_hours_per_day - v_progress.hours_completed);
  v_beans_to_add := v_new_hours * v_settings.beans_per_hour;

  UPDATE new_host_live_bonus_progress
    SET hours_completed = hours_completed + v_new_hours,
        beans_earned = beans_earned + v_beans_to_add
    WHERE id = v_progress.id;

  UPDATE profiles
    SET beans = COALESCE(beans, 0) + v_beans_to_add
    WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'beans_added', v_beans_to_add,
    'hours_completed', v_progress.hours_completed + v_new_hours,
    'max_hours', v_settings.max_hours_per_day,
    'day_number', v_day_number,
    'eligible_days', v_settings.eligible_days
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.timeout_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id UUID;
  _host_id UUID;
BEGIN
  -- Only timeout calls that are still ringing
  SELECT caller_id, host_id INTO _caller_id, _host_id
  FROM private_calls
  WHERE id = _call_id AND status = 'ringing';
  
  IF _caller_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Mark as missed
  UPDATE private_calls
  SET status = 'missed', ended_at = now(), end_reason = 'timeout'
  WHERE id = _call_id AND status = 'ringing';
  
  -- INSTANTLY reset both users
  UPDATE profiles
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE id IN (_caller_id, _host_id);
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_missed', jsonb_build_object('reason', 'timeout'));
  
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_my_call_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _my_call_id UUID;
  _caller_id UUID;
  _host_id UUID;
  _call_status TEXT;
BEGIN
  SELECT current_call_id INTO _my_call_id
  FROM profiles WHERE id = auth.uid();
  
  IF _my_call_id IS NOT NULL THEN
    SELECT pc.status, pc.caller_id, pc.host_id 
    INTO _call_status, _caller_id, _host_id
    FROM private_calls pc WHERE pc.id = _my_call_id;
    
    IF _call_status = 'connected' THEN
      UPDATE private_calls
      SET status = 'ended', ended_at = now(), end_reason = 'cleanup'
      WHERE id = _my_call_id AND status = 'connected';
      UPDATE profiles
      SET is_in_call = false, current_call_id = NULL, updated_at = now()
      WHERE id IN (_caller_id, _host_id);
    ELSIF _call_status IN ('pending', 'ringing') THEN
      IF auth.uid() = _caller_id THEN
        UPDATE private_calls
        SET status = 'ended', ended_at = now(), end_reason = 'caller_cancelled'
        WHERE id = _my_call_id AND status IN ('pending', 'ringing');
        UPDATE profiles
        SET is_in_call = false, current_call_id = NULL, updated_at = now()
        WHERE id IN (_caller_id, _host_id);
      ELSE
        NULL;
      END IF;
    ELSE
      UPDATE profiles
      SET is_in_call = false, current_call_id = NULL, updated_at = now()
      WHERE id = auth.uid();
    END IF;
  ELSE
    UPDATE profiles
    SET is_in_call = false, current_call_id = NULL, updated_at = now()
    WHERE id = auth.uid() AND is_in_call = true;
  END IF;
END;
$function$;"}		rjboss923@gmail.com	\N	\N
20260227191540	{"-- Remove the old cron job that calls edge function (unreliable due to SSL/network issues)
SELECT cron.unschedule(1);

-- Create new cron job that directly calls the DB function (no HTTP hop, no SSL issues)
-- Runs every Sunday at 00:00 UTC (6:00 AM BST)
SELECT cron.schedule(
  'weekly-agency-salary-transfer',
  '0 0 * * 0',
  $$SELECT public.process_weekly_agency_transfers()$$
);"}		rjboss923@gmail.com	\N	\N
20260227191749	{"-- Fix: process_weekly_agency_transfers should handle deleted hosts gracefully
-- The commission_history insert was using a subquery that could return a deleted host_id
CREATE OR REPLACE FUNCTION process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'
AS $$
DECLARE
  v_result jsonb;

CREATE OR REPLACE FUNCTION public.notify_reporter_on_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status changes to 'resolved'
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
    VALUES (
      NEW.reporter_id,
      'report_resolved',
      'Report Update',
      COALESCE(
        'Your report has been reviewed. Admin response: ' || NEW.admin_notes,
        'Your report has been reviewed and resolved. Thank you for helping keep the community safe.'
      ),
      jsonb_build_object(
        'report_id', NEW.id,
        'report_category', NEW.report_category,
        'action_taken', NEW.action_taken,
        'admin_notes', NEW.admin_notes,
        'resolved_at', NEW.reviewed_at
      ),
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_game_bet(
    p_user_id UUID,
    p_game_key TEXT,
    p_room_id TEXT,
    p_bet_amount BIGINT,
    p_bet_details JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_coins BIGINT;
    v_game_config game_configs%ROWTYPE;
    v_winning_slot INT;
    v_payout_multiplier NUMERIC;
    v_win_amount BIGINT;
    v_items JSONB;
    v_item JSONB;
    v_total_slots INT;
BEGIN
    SELECT coins INTO v_current_coins FROM profiles WHERE id = p_user_id;
    IF v_current_coins IS NULL THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    SELECT * INTO v_game_config FROM game_configs WHERE game_key = p_game_key AND is_active = true;
    IF v_game_config IS NULL THEN
        RETURN jsonb_build_object('error', 'Game not found or inactive');
    END IF;

    IF p_bet_amount < v_game_config.min_bet THEN
        RETURN jsonb_build_object('error', 'Bet too small');
    END IF;
    IF p_bet_amount > v_game_config.max_bet THEN
        RETURN jsonb_build_object('error', 'Bet too large');
    END IF;
    IF v_current_coins < p_bet_amount THEN
        RETURN jsonb_build_object('error', 'Insufficient balance', 'balance', v_current_coins);
    END IF;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;

    v_items := v_game_config.game_items;
    v_total_slots := jsonb_array_length(v_items);
    
    IF v_total_slots > 0 THEN
        v_winning_slot := floor(random() * v_total_slots)::INT;
        v_item := v_items -> v_winning_slot;
        v_payout_multiplier := COALESCE((v_item ->> 'multiplier')::NUMERIC, 0);
        
        IF random() * 100 < v_game_config.house_edge_percent THEN
            v_winning_slot := 0;
            FOR i IN 0..(v_total_slots - 1) LOOP
                IF COALESCE((v_items -> i ->> 'multiplier')::NUMERIC, 0) < COALESCE((v_items -> v_winning_slot ->> 'multiplier')::NUMERIC, 999) THEN
                    v_winning_slot := i;
                END IF;
            END LOOP;
            v_item := v_items -> v_winning_slot;
            v_payout_multiplier := COALESCE((v_item ->> 'multiplier')::NUMERIC, 0);
        END IF;
    ELSE
        v_winning_slot := 0;
        v_payout_multiplier := 0;
        v_item := '{}'::jsonb;
    END IF;

    v_win_amount := (p_bet_amount * v_payout_multiplier)::BIGINT;

    IF v_win_amount > 0 THEN
        UPDATE profiles SET coins = coins + v_win_amount WHERE id = p_user_id;
    END IF;

    INSERT INTO game_transactions (user_id, game_config_id, game_key, room_id, bet_amount, win_amount, net_result, bet_details, result_details)
    VALUES (
        p_user_id, v_game_config.id, p_game_key, p_room_id, p_bet_amount, v_win_amount, v_win_amount - p_bet_amount,
        p_bet_details,
        jsonb_build_object(
            'winning_slot', v_winning_slot,
            'winning_item', COALESCE(v_item ->> 'name', 'unknown'),
            'winning_emoji', COALESCE(v_item ->> 'emoji', ''),
            'payout_multiplier', v_payout_multiplier,
            'house_edge', v_game_config.house_edge_percent
        )
    );

    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'winning_slot', v_winning_slot,
        'winning_item', COALESCE(v_item ->> 'name', 'unknown'),
        'winning_emoji', COALESCE(v_item ->> 'emoji', ''),
        'payout_multiplier', v_payout_multiplier,
        'total_payout', v_win_amount,
        'net_result', v_win_amount - p_bet_amount,
        'new_balance', v_current_coins - p_bet_amount + v_win_amount
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.place_live_game_bet(p_round_id uuid, p_user_id uuid, p_bet_amount integer, p_bet_type text DEFAULT NULL::text, p_bet_value text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_round RECORD;
  v_user_coins INTEGER;
  v_existing_bet UUID;
BEGIN
  -- CRITICAL: User can only bet for themselves
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_round FROM live_game_rounds WHERE id = p_round_id;
  IF v_round IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Round not found'); END IF;
  IF v_round.status != 'betting' OR now() > v_round.betting_end_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Betting is closed');
  END IF;
  SELECT coins INTO v_user_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF v_user_coins < p_bet_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance'); END IF;
  SELECT id INTO v_existing_bet FROM live_game_bets 
  WHERE round_id = p_round_id AND user_id = p_user_id 
    AND COALESCE(bet_type, '') = COALESCE(p_bet_type, '')
    AND COALESCE(bet_value, '') = COALESCE(p_bet_value, '');
  IF v_existing_bet IS NOT NULL THEN
    UPDATE live_game_bets SET bet_amount = bet_amount + p_bet_amount WHERE id = v_existing_bet;
  ELSE
    INSERT INTO live_game_bets (round_id, user_id, bet_amount, bet_type, bet_value) VALUES (p_round_id, p_user_id, p_bet_amount, p_bet_type, p_bet_value);
    UPDATE live_game_rounds SET total_players = total_players + 1 WHERE id = p_round_id;
  END IF;
  UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;
  UPDATE live_game_rounds SET total_bets = total_bets + 1, total_bet_amount = total_bet_amount + p_bet_amount WHERE id = p_round_id;
  RETURN jsonb_build_object('success', true, 'bet_amount', p_bet_amount, 'new_balance', v_user_coins - p_bet_amount);
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_agency_wallet(p_agency_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_balance INTEGER;
  v_helper_balance INTEGER;
  v_helper_id UUID;
  v_owner_id UUID;
  v_deducted_agency INTEGER;
  v_deducted_helper INTEGER;
  v_remaining INTEGER;
BEGIN
  -- CRITICAL: Only admins or the agency owner can deduct
  SELECT owner_id INTO v_owner_id FROM agencies WHERE id = p_agency_id;
  IF auth.uid() IS NULL OR (auth.uid() != v_owner_id AND NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT wallet_balance, owner_id INTO v_agency_balance, v_owner_id
  FROM agencies
  WHERE id = p_agency_id
  FOR UPDATE;
  
  IF v_agency_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  
  SELECT id, wallet_balance INTO v_helper_id, v_helper_balance
  FROM topup_helpers
  WHERE user_id = v_owner_id
  FOR UPDATE;
  
  v_helper_balance := COALESCE(v_helper_balance, 0);
  v_agency_balance := COALESCE(v_agency_balance, 0);
  
  IF (v_agency_balance + v_helper_balance) < p_amount THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient balance',
      'agency_balance', v_agency_balance,
      'helper_balance', v_helper_balance,
      'total', v_agency_balance + v_helper_balance
    );
  END IF;
  
  v_remaining := p_amount;
  v_deducted_agency := 0;
  v_deducted_helper := 0;
  
  IF v_agency_balance >= v_remaining THEN
    v_deducted_agency := v_remaining;
    v_remaining := 0;
  ELSE
    v_deducted_agency := v_agency_balance;
    v_remaining := v_remaining - v_agency_balance;
  END IF;
  
  IF v_remaining > 0 AND v_helper_id IS NOT NULL THEN
    v_deducted_helper := v_remaining;
    v_remaining := 0;
  END IF;
  
  IF v_remaining > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance calculation error');
  END IF;
  
  IF v_deducted_agency > 0 THEN
    UPDATE agencies SET wallet_balance = wallet_balance - v_deducted_agency, updated_at = now() WHERE id = p_agency_id;
  END IF;
  
  IF v_deducted_helper > 0 AND v_helper_id IS NOT NULL THEN
    UPDATE topup_helpers SET wallet_balance = wallet_balance - v_deducted_helper WHERE id = v_helper_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'deducted_agency', v_deducted_agency,
    'deducted_helper', v_deducted_helper,
    'new_agency_balance', v_agency_balance - v_deducted_agency,
    'new_helper_balance', v_helper_balance - v_deducted_helper
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_admin_otps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.admin_login_otps 
  WHERE expires_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limit_attempts WHERE attempted_at < now() - interval '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_session_integrity(
  p_user_id UUID,
  p_device_fingerprint TEXT,
  p_ip_address TEXT,
  p_user_agent TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_session RECORD;
  v_risk_level TEXT := 'low';
  v_alerts JSONB := '[]'::jsonb;
  v_is_suspicious BOOLEAN := false;
BEGIN
  -- Get the last session record for this user
  SELECT * INTO v_last_session
  FROM public.session_security_logs
  WHERE user_id = p_user_id
    AND event_type = 'session_start'
  ORDER BY created_at DESC
  LIMIT 1;

  -- If we have a previous session, compare
  IF v_last_session IS NOT NULL THEN
    -- Check device fingerprint change
    IF v_last_session.device_fingerprint IS NOT NULL 
       AND v_last_session.device_fingerprint != p_device_fingerprint THEN
      v_risk_level := 'high';
      v_is_suspicious := true;
      v_alerts := v_alerts || jsonb_build_object(
        'type', 'device_change',
        'message', 'Different device detected',
        'previous', v_last_session.device_fingerprint,
        'current', p_device_fingerprint
      );
    END IF;

    -- Check IP address change
    IF v_last_session.ip_address IS NOT NULL 
       AND v_last_session.ip_address != p_ip_address THEN
      -- IP change alone is medium risk
      IF v_risk_level = 'low' THEN
        v_risk_level := 'medium';
      ELSE
        v_risk_level := 'critical'; -- Both device and IP changed
      END IF;
      v_is_suspicious := true;
      v_alerts := v_alerts || jsonb_build_object(
        'type', 'ip_change',
        'message', 'IP address changed',
        'previous', v_last_session.ip_address,
        'current', p_ip_address
      );
    END IF;

    -- Check user agent change (browser/OS)
    IF v_last_session.user_agent IS NOT NULL 
       AND v_last_session.user_agent != p_user_agent THEN
      IF v_risk_level = 'low' THEN
        v_risk_level := 'medium';
      END IF;
      v_alerts := v_alerts || jsonb_build_object(
        'type', 'ua_change',
        'message', 'Browser or OS changed',
        'previous', v_last_session.user_agent,
        'current', p_user_agent
      );
    END IF;
  END IF;

  -- Log this session
  INSERT INTO public.session_security_logs (
    user_id, device_fingerprint, ip_address, user_agent,
    event_type, risk_level, details
  ) VALUES (
    p_user_id, p_device_fingerprint, p_ip_address, p_user_agent,
    CASE WHEN v_is_suspicious THEN 'suspicious_activity' ELSE 'session_start' END,
    v_risk_level,
    jsonb_build_object('alerts', v_alerts)
  );

  -- If critical risk, also notify admins
  IF v_risk_level = 'critical' THEN
    INSERT INTO public.admin_logs (action_type, target_type, target_id, details)
    VALUES ('security_alert', 'user', p_user_id::text, jsonb_build_object(
      'type', 'session_hijack_suspect',
      'risk_level', v_risk_level,
      'ip_address', p_ip_address,
      'alerts', v_alerts
    ));
  END IF;

  RETURN jsonb_build_object(
    'valid', NOT (v_risk_level = 'critical'),
    'risk_level', v_risk_level,
    'is_suspicious', v_is_suspicious,
    'alerts', v_alerts,
    'action', CASE 
      WHEN v_risk_level = 'critical' THEN 'force_logout'
      WHEN v_risk_level = 'high' THEN 'require_verification'
      WHEN v_risk_level = 'medium' THEN 'warn'
      ELSE 'allow'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.raise_security_alert(
  p_alert_type text,
  p_severity text,
  p_description text,
  p_ip_address text DEFAULT NULL,
  p_device_info jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_id uuid;
BEGIN
  INSERT INTO public.security_alerts (
    alert_type, severity, user_id, ip_address, device_info, description, metadata
  ) VALUES (
    p_alert_type, p_severity, auth.uid(), p_ip_address, p_device_info, p_description, p_metadata
  )
  RETURNING id INTO v_alert_id;

  -- Also create an admin notification for high/critical alerts
  IF p_severity IN ('high', 'critical') THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    SELECT au.user_id, 'security_alert',
      '🚨 Security Alert: ' || p_alert_type,
      p_description,
      jsonb_build_object('alert_id', v_alert_id, 'severity', p_severity)
    FROM public.admin_users au
    WHERE au.is_active = true AND au.role IN ('owner', 'super_admin')
    AND au.user_id IS NOT NULL;
  END IF;

  RETURN v_alert_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_security_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.security_alerts
  WHERE is_resolved = true AND resolved_at < now() - interval '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.check_brute_force(
  p_identifier text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_count int;
  v_lockout record;
  v_cooldown_seconds int;
  v_max_attempts int := 5;
  v_window_minutes int := 15;
BEGIN
  -- Check existing lockout
  SELECT * INTO v_lockout FROM account_lockouts
  WHERE identifier = p_identifier AND locked_until > now();

  IF v_lockout IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'locked', true,
      'locked_until', v_lockout.locked_until,
      'remaining_seconds', EXTRACT(EPOCH FROM (v_lockout.locked_until - now()))::int,
      'failed_attempts', v_lockout.failed_attempts
    );
  END IF;

  -- Count recent failed attempts
  SELECT COUNT(*) INTO v_failed_count
  FROM login_attempts
  WHERE identifier = p_identifier
    AND success = false
    AND attempt_at > now() - (v_window_minutes || ' minutes')::interval;

  -- Progressive cooldown: 5 fails = 5min, 10 = 15min, 15 = 30min, 20+ = 60min
  IF v_failed_count >= 20 THEN
    v_cooldown_seconds := 3600; -- 1 hour
  ELSIF v_failed_count >= 15 THEN
    v_cooldown_seconds := 1800; -- 30 min
  ELSIF v_failed_count >= 10 THEN
    v_cooldown_seconds := 900; -- 15 min
  ELSIF v_failed_count >= v_max_attempts THEN
    v_cooldown_seconds := 300; -- 5 min
  ELSE
    v_cooldown_seconds := 0;
  END IF;

  IF v_cooldown_seconds > 0 THEN
    -- Create/update lockout
    INSERT INTO account_lockouts (identifier, locked_until, failed_attempts)
    VALUES (p_identifier, now() + (v_cooldown_seconds || ' seconds')::interval, v_failed_count)
    ON CONFLICT (identifier)
    DO UPDATE SET
      locked_at = now(),
      locked_until = now() + (v_cooldown_seconds || ' seconds')::interval,
      failed_attempts = v_failed_count;

    RETURN jsonb_build_object(
      'allowed', false,
      'locked', true,
      'locked_until', now() + (v_cooldown_seconds || ' seconds')::interval,
      'remaining_seconds', v_cooldown_seconds,
      'failed_attempts', v_failed_count
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'locked', false,
    'failed_attempts', v_failed_count,
    'attempts_remaining', v_max_attempts - v_failed_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_identifier text,
  p_success boolean,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO login_attempts (identifier, success, ip_address, user_agent)
  VALUES (p_identifier, p_success, p_ip_address, p_user_agent);

  -- On successful login, clear lockout
  IF p_success THEN
    DELETE FROM account_lockouts WHERE identifier = p_identifier;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_coins(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_balance INTEGER;
  rows_affected INTEGER;
BEGIN
  -- Auth check: user can deduct from self, admin can deduct from anyone, system (NULL) allowed
  IF auth.uid() IS NOT NULL 
     AND auth.uid() != p_user_id 
     AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE profiles
  SET coins = coins - p_amount
  WHERE id = p_user_id
    AND coins >= p_amount
  RETURNING coins INTO result_balance;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  IF rows_affected = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'new_balance', 0);
  ELSE
    RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_coins(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_balance INTEGER;
BEGIN
  -- Auth check: only admins or system (trigger) context
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE profiles
  SET coins = coins + p_amount
  WHERE id = p_user_id
  RETURNING coins INTO result_balance;

  IF result_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_face_verification(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can remove face verification';
  END IF;

  UPDATE profiles
  SET is_verified = false, is_face_verified = false, face_verified_at = null
  WHERE id = _user_id;
  
  DELETE FROM face_verification_submissions WHERE user_id = _user_id;
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_credit_call_earnings(_admin_id uuid, _call_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_id UUID;
  v_result JSONB;
  v_success_count INTEGER := 0;
  v_fail_count INTEGER := 0;
  v_total_credited INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND (auth.uid() != _admin_id OR NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  FOREACH v_call_id IN ARRAY _call_ids
  LOOP
    v_result := manual_credit_call_earnings(v_call_id, _admin_id, 'Bulk credit by admin');
    IF (v_result->>'success')::BOOLEAN THEN
      v_success_count := v_success_count + 1;
      v_total_credited := v_total_credited + COALESCE((v_result->>'earnings_credited')::INTEGER, 0);
    ELSE
      v_fail_count := v_fail_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true, 'credited_count', v_success_count,
    'failed_count', v_fail_count, 'total_beans_credited', v_total_credited
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_recovery_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM recovery_tokens WHERE expires_at < now() OR is_used = true;
END;
$$;

CREATE OR REPLACE FUNCTION public._internal_add_beans(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET beans = COALESCE(beans, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._internal_add_diamonds(_user_id uuid, _amount bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set bypass flag for the protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;

CREATE OR REPLACE FUNCTION public._internal_add_coins(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _amount <= 0 THEN RETURN; END IF;
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_level_on_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_weekly_income numeric;
  v_new_level text;
  v_new_commission numeric;
  v_week_start timestamp;
BEGIN
  -- Only process if total_earnings changed
  IF NEW.total_earnings IS NOT DISTINCT FROM OLD.total_earnings THEN
    RETURN NEW;
  END IF;

  -- Check if this user is in an agency
  SELECT ah.agency_id INTO v_agency_id
  FROM agency_hosts ah
  WHERE ah.host_id = NEW.id AND ah.status = 'active'
  LIMIT 1;

  IF v_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate total weekly income for this agency (sum of all active hosts' current earnings)
  SELECT COALESCE(SUM(p.total_earnings), 0) INTO v_weekly_income
  FROM agency_hosts ah
  JOIN profiles p ON p.id = ah.host_id
  WHERE ah.agency_id = v_agency_id AND ah.status = 'active';

  -- Determine level based on weekly income (using agency_level_tiers)
  SELECT level_code, commission_rate INTO v_new_level, v_new_commission
  FROM agency_level_tiers
  WHERE is_active = true
    AND v_weekly_income >= min_weekly_income
  ORDER BY min_weekly_income DESC
  LIMIT 1;

  -- Default to A1/3% if no tier matches
  v_new_level := COALESCE(v_new_level, 'A1');
  v_new_commission := COALESCE(v_new_commission, 3);

  -- Update agency level (only upgrade, never downgrade within same week)
  UPDATE agencies
  SET level = v_new_level,
      commission_rate = v_new_commission,
      updated_at = now()
  WHERE id = v_agency_id
    AND (
      -- Only update if new level is higher
      COALESCE(commission_rate, 3) < v_new_commission
      OR level IS NULL
    );

  RETURN NEW;
END;
$$;

-- Create trigger on profiles table for automatic agency level updates
DROP TRIGGER IF EXISTS trg_update_agency_level ON profiles;
CREATE TRIGGER trg_update_agency_level
  AFTER UPDATE OF total_earnings ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_agency_level_on_earnings();
"}		rjboss923@gmail.com	\N	\N
20260224145532	{"
-- Fix: Agency gets ONLY their commission %, host keeps the rest
CREATE OR REPLACE FUNCTION process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;

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

CREATE OR REPLACE FUNCTION public.notify_admin_users(p_title text, p_message text, p_type text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_record RECORD;
BEGIN
  FOR admin_record IN 
    SELECT au.user_id FROM admin_users au 
    WHERE au.is_active = true 
      AND au.user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = au.user_id)
  LOOP
    INSERT INTO notifications (user_id, title, message, type, data, is_read, created_at)
    VALUES (admin_record.user_id, p_title, p_message, p_type, p_data, false, now());
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_name TEXT;
BEGIN
  SELECT name INTO agency_name FROM agencies WHERE id = NEW.agency_id;
  PERFORM notify_admin_users(
    '💰 New Withdrawal Request',
    'Agency ' || COALESCE(agency_name, 'Unknown') || ' requested $' || NEW.amount || ' withdrawal',
    'agency_withdrawal',
    jsonb_build_object('withdrawal_id', NEW.id, 'agency_id', NEW.agency_id, 'amount', NEW.amount)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_helper_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  applicant_name TEXT;
BEGIN
  SELECT display_name INTO applicant_name FROM profiles WHERE id = NEW.user_id;
  PERFORM notify_admin_users(
    '🙋 New Helper Application',
    COALESCE(applicant_name, 'A user') || ' applied to become a helper',
    'helper_application',
    jsonb_build_object('application_id', NEW.id, 'user_id', NEW.user_id)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_helper_upgrade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  helper_name TEXT;
BEGIN
  SELECT p.display_name INTO helper_name 
  FROM topup_helpers th JOIN profiles p ON p.id = th.user_id 
  WHERE th.id = NEW.helper_id;
  PERFORM notify_admin_users(
    '⬆️ Helper Upgrade Request',
    COALESCE(helper_name, 'A helper') || ' requested level upgrade to ' || NEW.requested_level,
    'helper_upgrade_request',
    jsonb_build_object('request_id', NEW.id, 'helper_id', NEW.helper_id, 'requested_level', NEW.requested_level)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_helper_topup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify_admin_users(
    '💎 New Recharge Request',
    'New recharge request for $' || COALESCE(NEW.amount_usd::TEXT, '0') || ' via helper',
    'helper_topup_request',
    jsonb_build_object('request_id', NEW.id, 'helper_id', NEW.helper_id, 'amount', NEW.amount_usd)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_face_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  applicant_name TEXT;
  notif_title TEXT;
  notif_type TEXT;
BEGIN
  SELECT display_name INTO applicant_name FROM profiles WHERE id = NEW.user_id;
  
  IF NEW.verification_type = 'host' THEN
    notif_title := '🎤 New Host Application';
    notif_type := 'host_application';
  ELSE
    notif_title := '🔍 New Face Verification';
    notif_type := 'verification';
  END IF;
  
  PERFORM notify_admin_users(
    notif_title,
    COALESCE(applicant_name, 'A user') || ' submitted ' || NEW.verification_type || ' verification',
    notif_type,
    jsonb_build_object('submission_id', NEW.id, 'user_id', NEW.user_id, 'type', NEW.verification_type)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_support_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_name TEXT;
BEGIN
  SELECT display_name INTO user_name FROM profiles WHERE id = NEW.user_id;
  PERFORM notify_admin_users(
    '🎫 New Support Ticket',
    COALESCE(user_name, 'A user') || ': ' || LEFT(NEW.subject, 50),
    'support',
    jsonb_build_object('ticket_id', NEW.id, 'user_id', NEW.user_id, 'subject', NEW.subject)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_new_agency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notify_admin_users(
    '🏢 New Agency Created',
    'New agency \\"' || NEW.name || '\\" (Code: ' || NEW.agency_code || ') has been created',
    'agency_created',
    jsonb_build_object('agency_id', NEW.id, 'agency_name', NEW.name, 'agency_code', NEW.agency_code)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_face_verification_auto(
  _submission_id uuid,
  _detected_gender text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _profile_gender TEXT;
BEGIN
  SELECT user_id INTO _user_id FROM face_verification_submissions WHERE id = _submission_id;
  SELECT gender INTO _profile_gender FROM profiles WHERE id = _user_id;
  
  IF _detected_gender IS NULL THEN
    UPDATE face_verification_submissions SET status = 'pending' WHERE id = _submission_id;
    RETURN 'pending';
  END IF;
  
  IF LOWER(_profile_gender) = LOWER(_detected_gender) THEN
    UPDATE face_verification_submissions
    SET status = 'approved', reviewed_at = now()
    WHERE id = _submission_id;
    
    UPDATE profiles
    SET is_verified = true, is_face_verified = true, face_verified_at = now()
    WHERE id = _user_id;
    
    RETURN 'approved';
  ELSE
    UPDATE face_verification_submissions
    SET status = 'rejected',
        rejection_reason = 'জেন্ডার ম্যাচ হয়নি। প্রোফাইল জেন্ডার: ' || COALESCE(_profile_gender, 'অজানা') || ', ডিটেক্টেড: ' || _detected_gender,
        reviewed_at = now()
    WHERE id = _submission_id;
    
    RETURN 'rejected';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_agency_owner(_user_id uuid, _agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agencies
    WHERE id = _agency_id AND owner_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_agency_host(_user_id uuid, _agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agency_hosts
    WHERE agency_id = _agency_id AND host_id = _user_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.reset_weekly_contact_violations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  week_start timestamptz;
  week_end timestamptz;
BEGIN
  -- Calculate the week that just ended
  week_end := now();
  week_start := week_end - interval '7 days';

  -- Mark all unreviewed violations as archived (weekly reset)
  UPDATE public.chat_moderation_logs
  SET 
    action_taken = COALESCE(action_taken, '') || '_weekly_archived',
    reviewed_at = now(),
    notes = COALESCE(notes, '') || ' [Auto-archived: Weekly reset at ' || now()::text || ']'
  WHERE violation_type IN ('contact_sharing', 'phone_number', 'social_media', 'image_contact')
    AND reviewed_at IS NULL
    AND created_at >= week_start
    AND created_at < week_end;

  -- Also archive host_contact_violations
  UPDATE public.host_contact_violations
  SET 
    admin_reviewed = true,
    admin_action = COALESCE(admin_action, 'weekly_archived'),
    admin_notes = COALESCE(admin_notes, '') || ' [Weekly reset: ' || now()::text || ']'
  WHERE admin_reviewed = false
    AND detected_at < week_end;

  RAISE NOTICE 'Weekly contact violations reset completed at %', now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agency_diamond_balance(owner_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(diamond_balance, 0)
  FROM agencies
  WHERE owner_id = owner_user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.helper_transfer_coins_to_user(
  _sender_id uuid,
  _receiver_id uuid,
  _amount integer,
  _sender_type text DEFAULT 'helper'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_is_helper boolean := false;
  v_is_agency_owner boolean := false;
  v_helper_id uuid;
  v_helper_balance bigint;
  v_agency_id uuid;
  v_agency_balance bigint;
  v_total_available bigint := 0;
  v_remaining integer;
  v_agency_deduct integer := 0;
  v_helper_deduct integer := 0;
  v_safe_sender_type text;
  v_receiver_new_balance bigint;
  v_sender_name text;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR v_caller != _sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Get sender name for notification
  SELECT display_name INTO v_sender_name FROM profiles WHERE id = _sender_id;

  -- Sanitize sender_type
  v_safe_sender_type := CASE 
    WHEN _sender_type IN ('agency', 'admin', 'helper', 'trader', 'trader_to_user', 'agency_to_user', 'helper_to_user') THEN _sender_type
    ELSE 'helper'
  END;

  -- Check if sender is an active helper
  SELECT id, wallet_balance INTO v_helper_id, v_helper_balance
  FROM topup_helpers
  WHERE user_id = _sender_id AND is_active = true
  LIMIT 1;

  IF v_helper_id IS NOT NULL THEN
    v_is_helper := true;
    v_helper_balance := COALESCE(v_helper_balance, 0);
    v_total_available := v_total_available + v_helper_balance;
  END IF;

  -- Check if sender is an agency owner
  SELECT id, diamond_balance INTO v_agency_id, v_agency_balance
  FROM agencies
  WHERE owner_id = _sender_id AND is_active = true
  LIMIT 1;

  IF v_agency_id IS NOT NULL THEN
    v_is_agency_owner := true;
    v_agency_balance := COALESCE(v_agency_balance, 0);
    v_total_available := v_total_available + v_agency_balance;
  END IF;

  IF NOT v_is_helper AND NOT v_is_agency_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to transfer');
  END IF;

  IF _amount > v_total_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_remaining := _amount;

  -- Deduct from agency first
  IF v_is_agency_owner AND v_agency_balance > 0 AND v_remaining > 0 THEN
    v_agency_deduct := LEAST(v_remaining, v_agency_balance::integer);
    UPDATE agencies SET diamond_balance = diamond_balance - v_agency_deduct WHERE id = v_agency_id;
    v_remaining := v_remaining - v_agency_deduct;
  END IF;

  -- Deduct remainder from helper wallet
  IF v_is_helper AND v_remaining > 0 THEN
    v_helper_deduct := LEAST(v_remaining, v_helper_balance::integer);
    UPDATE topup_helpers SET wallet_balance = wallet_balance - v_helper_deduct WHERE id = v_helper_id AND wallet_balance >= v_helper_deduct;
    IF NOT FOUND THEN
      IF v_agency_deduct > 0 THEN
        UPDATE agencies SET diamond_balance = diamond_balance + v_agency_deduct WHERE id = v_agency_id;
      END IF;
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient helper wallet balance');
    END IF;
    v_remaining := v_remaining - v_helper_deduct;
  END IF;

  IF v_remaining > 0 THEN
    IF v_agency_deduct > 0 THEN
      UPDATE agencies SET diamond_balance = diamond_balance + v_agency_deduct WHERE id = v_agency_id;
    END IF;
    IF v_helper_deduct > 0 THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance + v_helper_deduct WHERE id = v_helper_id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Add coins to receiver's My Diamond balance
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id
  RETURNING coins INTO v_receiver_new_balance;
  
  IF NOT FOUND THEN
    IF v_agency_deduct > 0 THEN
      UPDATE agencies SET diamond_balance = diamond_balance + v_agency_deduct WHERE id = v_agency_id;
    END IF;
    IF v_helper_deduct > 0 THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance + v_helper_deduct WHERE id = v_helper_id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Receiver not found');
  END IF;

  -- Log transaction
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, sender_type, note, status)
  VALUES (_sender_id, _receiver_id, _amount, v_safe_sender_type,
    'Transfer of ' || _amount || ' diamonds', 'completed');

  -- Send notification to receiver
  INSERT INTO notifications (user_id, title, message, type, is_read, data)
  VALUES (
    _receiver_id,
    '💎 Diamond Received!',
    'You received ' || _amount::text || ' Diamonds to your My Diamond balance!' ||
    CASE WHEN v_sender_name IS NOT NULL THEN E'\\\
\\\
From: ' || v_sender_name ELSE '' END ||
    E'\\\
\\\
💰 New Balance: ' || v_receiver_new_balance::text || ' Diamonds',
    'reward',
    false,
    jsonb_build_object('amount', _amount, 'sender_id', _sender_id, 'new_balance', v_receiver_new_balance)
  );

  RETURN jsonb_build_object(
    'success', true,
    'agency_deducted', v_agency_deduct,
    'helper_deducted', v_helper_deduct,
    'total_transferred', _amount,
    'receiver_new_balance', v_receiver_new_balance
  );
END;
$$;
"}		rjboss923@gmail.com	\N	\N
20260305012214	{"CREATE OR REPLACE FUNCTION check_agency_host_compliance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency RECORD;

CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_agency(
  _sender_id uuid,
  _target_agency_id uuid,
  _amount integer,
  _sender_type text DEFAULT 'trader_to_agency'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_is_helper boolean := false;
  v_is_agency_owner boolean := false;
  v_helper_id uuid;
  v_helper_balance bigint;
  v_agency_id uuid;
  v_agency_balance bigint;
  v_total_available bigint := 0;
  v_remaining integer;
  v_agency_deduct integer := 0;
  v_helper_deduct integer := 0;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL OR v_caller != _sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Check if sender is an active helper
  SELECT id, wallet_balance INTO v_helper_id, v_helper_balance
  FROM topup_helpers
  WHERE user_id = _sender_id AND is_active = true
  LIMIT 1;

  IF v_helper_id IS NOT NULL THEN
    v_is_helper := true;
    v_helper_balance := COALESCE(v_helper_balance, 0);
    v_total_available := v_total_available + v_helper_balance;
  END IF;

  -- Check if sender is an agency owner
  SELECT id, diamond_balance INTO v_agency_id, v_agency_balance
  FROM agencies
  WHERE owner_id = _sender_id AND is_active = true
  LIMIT 1;

  IF v_agency_id IS NOT NULL THEN
    v_is_agency_owner := true;
    v_agency_balance := COALESCE(v_agency_balance, 0);
    v_total_available := v_total_available + v_agency_balance;
  END IF;

  IF NOT v_is_helper AND NOT v_is_agency_owner THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to transfer');
  END IF;

  IF _amount > v_total_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_remaining := _amount;

  -- Deduct from sender's agency first
  IF v_is_agency_owner AND v_agency_balance > 0 AND v_remaining > 0 THEN
    v_agency_deduct := LEAST(v_remaining, v_agency_balance::integer);
    UPDATE agencies SET diamond_balance = diamond_balance - v_agency_deduct WHERE id = v_agency_id;
    v_remaining := v_remaining - v_agency_deduct;
  END IF;

  -- Deduct remainder from helper wallet
  IF v_is_helper AND v_remaining > 0 THEN
    v_helper_deduct := LEAST(v_remaining, v_helper_balance::integer);
    UPDATE topup_helpers
    SET wallet_balance = wallet_balance - v_helper_deduct
    WHERE id = v_helper_id AND wallet_balance >= v_helper_deduct;
    
    IF NOT FOUND THEN
      IF v_agency_deduct > 0 THEN
        UPDATE agencies SET diamond_balance = diamond_balance + v_agency_deduct WHERE id = v_agency_id;
      END IF;
      RETURN jsonb_build_object('success', false, 'error', 'Insufficient helper wallet balance');
    END IF;
    v_remaining := v_remaining - v_helper_deduct;
  END IF;

  IF v_remaining > 0 THEN
    IF v_agency_deduct > 0 THEN
      UPDATE agencies SET diamond_balance = diamond_balance + v_agency_deduct WHERE id = v_agency_id;
    END IF;
    IF v_helper_deduct > 0 THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance + v_helper_deduct WHERE id = v_helper_id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- ATOMIC: Add diamonds to target agency
  UPDATE agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount
  WHERE id = _target_agency_id;

  IF NOT FOUND THEN
    IF v_agency_deduct > 0 THEN
      UPDATE agencies SET diamond_balance = diamond_balance + v_agency_deduct WHERE id = v_agency_id;
    END IF;
    IF v_helper_deduct > 0 THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance + v_helper_deduct WHERE id = v_helper_id;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Target agency not found');
  END IF;

  -- Log transaction
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, sender_type, note, status)
  VALUES (_sender_id, _target_agency_id, _amount, _sender_type,
    'Transfer of ' || _amount || ' diamonds to agency', 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'agency_deducted', v_agency_deduct,
    'helper_deducted', v_helper_deduct,
    'total_transferred', _amount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_user(
  _agency_id uuid,
  _receiver_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_agency_owner_id uuid;
  v_current_balance bigint;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Verify caller owns this agency
  SELECT owner_id INTO v_agency_owner_id FROM agencies WHERE id = _agency_id AND is_active = true;
  IF v_agency_owner_id IS NULL OR v_agency_owner_id != v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not agency owner');
  END IF;

  -- Get fresh balance
  SELECT diamond_balance INTO v_current_balance FROM agencies WHERE id = _agency_id FOR UPDATE;
  v_current_balance := COALESCE(v_current_balance, 0);

  IF _amount > v_current_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance');
  END IF;

  -- Deduct from agency
  UPDATE agencies SET diamond_balance = diamond_balance - _amount WHERE id = _agency_id;

  -- Add to user coins
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id;
  IF NOT FOUND THEN
    -- Rollback
    UPDATE agencies SET diamond_balance = diamond_balance + _amount WHERE id = _agency_id;
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object('success', true, 'new_agency_balance', v_current_balance - _amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_agency(
  _sender_agency_id uuid,
  _target_agency_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_sender_owner_id uuid;
  v_sender_balance bigint;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Verify caller owns sender agency
  SELECT owner_id INTO v_sender_owner_id FROM agencies WHERE id = _sender_agency_id AND is_active = true;
  IF v_sender_owner_id IS NULL OR v_sender_owner_id != v_caller THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not agency owner');
  END IF;

  -- Lock and check sender balance
  SELECT diamond_balance INTO v_sender_balance FROM agencies WHERE id = _sender_agency_id FOR UPDATE;
  v_sender_balance := COALESCE(v_sender_balance, 0);

  IF _amount > v_sender_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance');
  END IF;

  -- Verify target agency exists
  IF NOT EXISTS (SELECT 1 FROM agencies WHERE id = _target_agency_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target agency not found');
  END IF;

  -- Deduct from sender
  UPDATE agencies SET diamond_balance = diamond_balance - _amount WHERE id = _sender_agency_id;

  -- Add to target agency diamond_balance
  UPDATE agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _amount WHERE id = _target_agency_id;

  RETURN jsonb_build_object('success', true, 'new_sender_balance', v_sender_balance - _amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If current_user differs from session_user, we're inside a SECURITY DEFINER function - allow
  IF current_user IS DISTINCT FROM session_user THEN
    RETURN NEW;
  END IF;

  -- Check for authorized internal bypass (used by cron jobs / SECURITY DEFINER RPCs)
  BEGIN
    IF current_setting('app.bypass_profile_protection', true) = 'true' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Setting doesn't exist, continue with protection
    NULL;
  END;

  -- Block direct modifications by regular users
  IF NEW.coins IS DISTINCT FROM OLD.coins THEN
    RAISE EXCEPTION 'Direct modification of coins is not allowed';
  END IF;
  IF NEW.beans IS DISTINCT FROM OLD.beans THEN
    RAISE EXCEPTION 'Direct modification of beans is not allowed';
  END IF;
  IF NEW.diamonds IS DISTINCT FROM OLD.diamonds THEN
    RAISE EXCEPTION 'Direct modification of diamonds is not allowed';
  END IF;
  IF NEW.total_earnings IS DISTINCT FROM OLD.total_earnings THEN
    RAISE EXCEPTION 'Direct modification of total_earnings is not allowed';
  END IF;
  IF NEW.pending_earnings IS DISTINCT FROM OLD.pending_earnings THEN
    RAISE EXCEPTION 'Direct modification of pending_earnings is not allowed';
  END IF;
  IF NEW.weekly_earnings IS DISTINCT FROM OLD.weekly_earnings THEN
    RAISE EXCEPTION 'Direct modification of weekly_earnings is not allowed';
  END IF;
  IF NEW.total_consumption IS DISTINCT FROM OLD.total_consumption THEN
    RAISE EXCEPTION 'Direct modification of total_consumption is not allowed';
  END IF;
  IF NEW.total_recharged IS DISTINCT FROM OLD.total_recharged THEN
    RAISE EXCEPTION 'Direct modification of total_recharged is not allowed';
  END IF;
  IF NEW.is_host IS DISTINCT FROM OLD.is_host THEN
    RAISE EXCEPTION 'Direct modification of is_host is not allowed';
  END IF;
  IF NEW.host_status IS DISTINCT FROM OLD.host_status THEN
    RAISE EXCEPTION 'Direct modification of host_status is not allowed';
  END IF;
  IF NEW.host_level IS DISTINCT FROM OLD.host_level THEN
    RAISE EXCEPTION 'Direct modification of host_level is not allowed';
  END IF;
  IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    RAISE EXCEPTION 'Direct modification of is_verified is not allowed';
  END IF;
  IF NEW.is_face_verified IS DISTINCT FROM OLD.is_face_verified THEN
    RAISE EXCEPTION 'Direct modification of is_face_verified is not allowed';
  END IF;
  IF NEW.user_level IS DISTINCT FROM OLD.user_level THEN
    RAISE EXCEPTION 'Direct modification of user_level is not allowed';
  END IF;
  IF NEW.max_user_level IS DISTINCT FROM OLD.max_user_level THEN
    RAISE EXCEPTION 'Direct modification of max_user_level is not allowed';
  END IF;
  IF NEW.current_vip_tier_id IS DISTINCT FROM OLD.current_vip_tier_id THEN
    RAISE EXCEPTION 'Direct modification of current_vip_tier_id is not allowed';
  END IF;
  IF NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at THEN
    RAISE EXCEPTION 'Direct modification of vip_expires_at is not allowed';
  END IF;
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN
    RAISE EXCEPTION 'Direct modification of is_blocked is not allowed';
  END IF;
  IF NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'Direct modification of agency_id is not allowed';
  END IF;
  IF NEW.is_agency_owner IS DISTINCT FROM OLD.is_agency_owner THEN
    RAISE EXCEPTION 'Direct modification of is_agency_owner is not allowed';
  END IF;
  IF NEW.face_hash IS DISTINCT FROM OLD.face_hash THEN
    RAISE EXCEPTION 'Direct modification of face_hash is not allowed';
  END IF;
  IF NEW.phone_violation_count IS DISTINCT FROM OLD.phone_violation_count THEN
    RAISE EXCEPTION 'Direct modification of phone_violation_count is not allowed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.helper_add_coins_to_user(
  _user_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Verify caller is an active helper or admin
  IF NOT EXISTS (SELECT 1 FROM topup_helpers WHERE user_id = v_caller AND is_active = true)
     AND NOT public.is_admin(v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an active helper');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.helper_add_diamonds_to_agency(
  _agency_id uuid,
  _amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Verify caller is an active helper or admin
  IF NOT EXISTS (SELECT 1 FROM topup_helpers WHERE user_id = v_caller AND is_active = true)
     AND NOT public.is_admin(v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an active helper');
  END IF;

  IF _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  UPDATE agencies
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount
  WHERE id = _agency_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
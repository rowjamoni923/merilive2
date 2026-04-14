
-- 2. get_user_notices
CREATE OR REPLACE FUNCTION public.get_user_notices(p_user_id uuid)
RETURNS TABLE(id uuid, title text, message text, priority text, image_url text, created_at timestamptz, is_read boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT n.id, n.title, n.message, n.priority, n.image_url, n.created_at,
    (p_user_id::text = ANY(COALESCE(n.read_by, '{}'::text[]))) AS is_read
  FROM admin_notices n
  WHERE n.is_active = true AND (n.expires_at IS NULL OR n.expires_at > now())
  ORDER BY n.created_at DESC LIMIT 50;
END;
$$;

-- 3. place_live_game_bet
CREATE OR REPLACE FUNCTION public.place_live_game_bet(p_round_id uuid, p_user_id uuid, p_bet_amount integer, p_bet_type text DEFAULT NULL, p_bet_value text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_coins integer;
BEGIN
  SELECT coins INTO user_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF COALESCE(user_coins, 0) < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;
  INSERT INTO game_bets (user_id, round_id, bet_amount, bet_type, bet_value, status)
  VALUES (p_user_id, p_round_id, p_bet_amount, p_bet_type, p_bet_value, 'placed');
  RETURN jsonb_build_object('success', true, 'new_balance', user_coins - p_bet_amount);
END;
$$;

-- 4. process_game_bet
CREATE OR REPLACE FUNCTION public.process_game_bet(p_user_id uuid, p_game_id text, p_bet_amount integer, p_bet_type text DEFAULT NULL, p_bet_value text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_coins integer;
  new_bet_id uuid;
BEGIN
  SELECT coins INTO user_coins FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF COALESCE(user_coins, 0) < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;
  INSERT INTO game_bets (user_id, bet_amount, bet_type, bet_value, status)
  VALUES (p_user_id, p_bet_amount, p_bet_type, p_bet_value, 'placed')
  RETURNING id INTO new_bet_id;
  RETURN jsonb_build_object('success', true, 'bet_id', new_bet_id, 'new_balance', user_coins - p_bet_amount);
END;
$$;

-- 5. process_live_game_round
CREATE OR REPLACE FUNCTION public.process_live_game_round(p_round_id uuid, p_winning_value text, p_result text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  bet RECORD;
  winners integer := 0;
  total_payout bigint := 0;
BEGIN
  UPDATE live_game_rounds SET status = 'completed', winning_value = p_winning_value, result = p_result, ended_at = now() WHERE id = p_round_id;
  FOR bet IN SELECT * FROM game_bets WHERE round_id = p_round_id AND status = 'placed' LOOP
    IF bet.bet_value = p_winning_value THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET coins = coins + (bet.bet_amount * 2) WHERE id = bet.user_id;
      UPDATE game_bets SET status = 'won', win_amount = bet.bet_amount * 2 WHERE id = bet.id;
      winners := winners + 1;
      total_payout := total_payout + (bet.bet_amount * 2);
    ELSE
      UPDATE game_bets SET status = 'lost', win_amount = 0 WHERE id = bet.id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'winners', winners, 'total_payout', total_payout);
END;
$$;

-- 6. raise_security_alert
CREATE OR REPLACE FUNCTION public.raise_security_alert(p_alert_type text, p_severity text, p_description text, p_ip_address text DEFAULT NULL, p_device_info jsonb DEFAULT NULL, p_metadata jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO admin_notifications (type, title, message, priority, data)
  VALUES ('security_alert', p_alert_type, p_description, p_severity,
    jsonb_build_object('ip', p_ip_address, 'device', p_device_info, 'meta', p_metadata, 'user_id', auth.uid()));
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. record_live_violation
CREATE OR REPLACE FUNCTION public.record_live_violation(p_user_id uuid, p_stream_id uuid, p_violation_type text, p_auto_detected boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO chat_moderation_logs (user_id, message_id, violation_type, action_taken)
  VALUES (p_user_id, p_stream_id, p_violation_type, CASE WHEN p_auto_detected THEN 'auto_warning' ELSE 'manual_warning' END);
END;
$$;

-- 8. record_login_attempt
CREATE OR REPLACE FUNCTION public.record_login_attempt(p_identifier text, p_success boolean, p_ip_address text DEFAULT NULL, p_user_agent text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT p_success THEN
    INSERT INTO account_lockouts (identifier, locked_until, reason, failed_attempts)
    VALUES (p_identifier, now() + interval '15 minutes', 'failed_login', 1)
    ON CONFLICT (identifier) DO UPDATE SET
      failed_attempts = COALESCE(account_lockouts.failed_attempts, 0) + 1,
      locked_until = CASE WHEN COALESCE(account_lockouts.failed_attempts, 0) >= 4 THEN now() + interval '15 minutes' ELSE account_lockouts.locked_until END;
  ELSE
    DELETE FROM account_lockouts WHERE identifier = p_identifier;
  END IF;
END;
$$;

-- 9. reset_my_call_status
CREATE OR REPLACE FUNCTION public.reset_my_call_status()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET is_in_call = false, current_call_id = NULL WHERE id = auth.uid();
END;
$$;

-- 10. roulette_get_or_create_session
CREATE OR REPLACE FUNCTION public.roulette_get_or_create_session(p_duration_seconds integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  active RECORD;
  new_id uuid;
  ends_at timestamptz;
BEGIN
  SELECT * INTO active FROM live_game_rounds
  WHERE game_type = 'roulette' AND status IN ('betting', 'spinning')
  ORDER BY created_at DESC LIMIT 1;
  IF active IS NOT NULL THEN
    RETURN jsonb_build_object('id', active.id, 'status', active.status, 'betting_ends_at', active.betting_ends_at, 'created_at', active.created_at);
  END IF;
  ends_at := now() + make_interval(secs => p_duration_seconds);
  INSERT INTO live_game_rounds (game_type, status, betting_ends_at)
  VALUES ('roulette', 'betting', ends_at)
  RETURNING id INTO new_id;
  RETURN jsonb_build_object('id', new_id, 'status', 'betting', 'betting_ends_at', ends_at, 'created_at', now());
END;
$$;

-- 11. roulette_spin_wheel
CREATE OR REPLACE FUNCTION public.roulette_spin_wheel(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE live_game_rounds SET status = 'spinning' WHERE id = p_session_id AND status = 'betting';
END;
$$;

-- 12. roulette_complete_session
CREATE OR REPLACE FUNCTION public.roulette_complete_session(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE live_game_rounds SET status = 'completed', ended_at = now() WHERE id = p_session_id;
END;
$$;

-- 13. timeout_private_call
CREATE OR REPLACE FUNCTION public.timeout_private_call(_call_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  call_rec RECORD;
BEGIN
  SELECT * INTO call_rec FROM private_calls WHERE id = _call_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false); END IF;
  IF call_rec.status IN ('ended', 'declined', 'missed') THEN RETURN jsonb_build_object('success', true, 'already_ended', true); END IF;
  UPDATE private_calls SET status = 'missed', ended_at = now(), end_reason = 'timeout' WHERE id = _call_id;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET is_in_call = false, current_call_id = NULL WHERE id IN (call_rec.caller_id, call_rec.host_id);
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 14. update_active_session
CREATE OR REPLACE FUNCTION public.update_active_session(_session_id text, _device_info jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET active_session_id = _session_id, last_active_at = now() WHERE id = auth.uid();
END;
$$;

-- 15. update_stream_heartbeat
CREATE OR REPLACE FUNCTION public.update_stream_heartbeat(_stream_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE live_streams SET last_heartbeat = now() WHERE id = _stream_id AND is_active = true;
END;
$$;

-- 16. update_task_progress
CREATE OR REPLACE FUNCTION public.update_task_progress(_task_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  task_rec RECORD;
BEGIN
  SELECT * INTO task_rec FROM user_tasks WHERE user_id = auth.uid() AND task_key = _task_key;
  IF NOT FOUND THEN
    INSERT INTO user_tasks (user_id, task_key, progress, completed) VALUES (auth.uid(), _task_key, 1, false);
  ELSE
    UPDATE user_tasks SET progress = COALESCE(progress, 0) + 1 WHERE id = task_rec.id;
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

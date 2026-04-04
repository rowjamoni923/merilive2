CREATE OR REPLACE FUNCTION public.is_conversation_participant(_user_id UUID, _conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = _conversation_id
    AND (participant1_id = _user_id OR participant2_id = _user_id)
  )
$$;


CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name TEXT;
BEGIN
  _name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'name'
  );

  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, _name)
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(
      NULLIF(EXCLUDED.display_name, ''),
      profiles.display_name
    );
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


CREATE OR REPLACE FUNCTION public.get_agency_by_code(agency_code TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  level TEXT,
  total_hosts INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, level, total_hosts
  FROM public.agencies
  WHERE agencies.agency_code = get_agency_by_code.agency_code
  AND is_active = true
  LIMIT 1;
$$;


CREATE OR REPLACE FUNCTION public.join_agency(
  _host_id uuid,
  _agency_code text,
  _joined_via text DEFAULT 'code'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_existing_id uuid;
  v_existing_status text;
BEGIN
  SELECT id INTO v_agency_id
  FROM agencies
  WHERE agency_code = _agency_code AND is_active = true;
  
  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency not found or inactive';
  END IF;
  
  SELECT id, status INTO v_existing_id, v_existing_status
  FROM agency_hosts
  WHERE host_id = _host_id
  LIMIT 1;
  
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'active' THEN
      RAISE EXCEPTION 'Already a member of an agency';
    END IF;
    
    IF v_existing_status = 'pending' THEN
      SELECT id INTO v_existing_id
      FROM agency_hosts
      WHERE host_id = _host_id AND agency_id = v_agency_id AND status = 'pending';
      
      IF v_existing_id IS NOT NULL THEN
        RAISE EXCEPTION 'Join request already pending';
      END IF;
    END IF;
    
    DELETE FROM agency_hosts
    WHERE host_id = _host_id AND status IN ('rejected', 'left', 'removed', 'pending');
  END IF;
  
  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW());
  
  RETURN true;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_agency_rankings(
  _ranking_type TEXT,
  _period_type TEXT,
  _limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  rank_position INTEGER,
  agency_id UUID,
  agency_name TEXT,
  agency_code TEXT,
  owner_avatar TEXT,
  country_code TEXT,
  country_flag TEXT,
  metric_value DECIMAL,
  total_hosts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  period_start_date DATE;
BEGIN
  IF _period_type = 'weekly' THEN
    period_start_date := date_trunc('week', CURRENT_DATE)::date;
  ELSE
    period_start_date := date_trunc('month', CURRENT_DATE)::date;
  END IF;

  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY 
      COALESCE(
        CASE _ranking_type
          WHEN 'golden_host_income' THEN ap.golden_host_income
          WHEN 'new_host' THEN ap.new_hosts_count::DECIMAL
          WHEN 'host_duration' THEN ap.total_host_hours
          ELSE ap.total_income
        END, 0
      ) DESC
    )::INTEGER as rank_position,
    a.id as agency_id,
    a.name as agency_name,
    a.agency_code,
    p.avatar_url as owner_avatar,
    p.country_code,
    p.country_flag,
    COALESCE(
      CASE _ranking_type
        WHEN 'golden_host_income' THEN ap.golden_host_income
        WHEN 'new_host' THEN ap.new_hosts_count::DECIMAL
        WHEN 'host_duration' THEN ap.total_host_hours
        ELSE ap.total_income
      END, 0
    ) as metric_value,
    COALESCE(a.total_hosts, 0)::INTEGER as total_hosts
  FROM public.agencies a
  LEFT JOIN public.agency_performance ap ON a.id = ap.agency_id 
    AND ap.period_type = _period_type
    AND ap.period_start = period_start_date
  LEFT JOIN public.profiles p ON a.owner_id = p.id
  WHERE a.is_active = true AND a.is_blocked = false
  ORDER BY metric_value DESC NULLS LAST
  LIMIT _limit;
END;
$$;


CREATE OR REPLACE FUNCTION public.update_agency_performance_on_gift()
RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _period_start DATE;
  _beans_per_dollar NUMERIC;
  _host_share NUMERIC;
  _usd_amount NUMERIC;
BEGIN
  SELECT agency_id INTO _host_agency_id
  FROM public.profiles
  WHERE id = NEW.receiver_id;
  
  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((setting_value::text)::numeric, 9000) INTO _beans_per_dollar
  FROM public.app_settings WHERE setting_key = 'beans_per_dollar';
  IF _beans_per_dollar IS NULL OR _beans_per_dollar <= 0 THEN
    _beans_per_dollar := 9000;
  END IF;

  SELECT COALESCE((setting_value::text)::numeric, 55) INTO _host_share
  FROM public.app_settings WHERE setting_key = 'host_percent';
  IF _host_share IS NULL OR _host_share <= 0 THEN
    _host_share := 55;
  END IF;

  _usd_amount := ROUND((NEW.coin_amount * (_host_share / 100.0)) / _beans_per_dollar, 2);
  _period_start := date_trunc('week', CURRENT_DATE)::date;
  
  INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
  VALUES (_host_agency_id, 'weekly', _period_start, _usd_amount, _usd_amount)
  ON CONFLICT (agency_id, period_type, period_start)
  DO UPDATE SET 
    total_income = agency_performance.total_income + _usd_amount,
    golden_host_income = agency_performance.golden_host_income + _usd_amount,
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION public.update_stream_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.live_streams
    SET viewer_count = COALESCE(viewer_count, 0) + 1
    WHERE id = NEW.stream_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
      UPDATE public.live_streams
      SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0)
      WHERE id = NEW.stream_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION public.update_host_hours_on_stream_end()
RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _period_start DATE;
  _duration_hours DECIMAL;
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    _duration_hours := EXTRACT(EPOCH FROM (NEW.ended_at - COALESCE(NEW.started_at, NEW.created_at))) / 3600;
    
    SELECT agency_id INTO _host_agency_id
    FROM public.profiles
    WHERE id = NEW.host_id;
    
    IF _host_agency_id IS NOT NULL THEN
      _period_start := date_trunc('week', CURRENT_DATE)::date;
      
      INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_host_hours)
      VALUES (_host_agency_id, 'weekly', _period_start, _duration_hours)
      ON CONFLICT (agency_id, period_type, period_start)
      DO UPDATE SET 
        total_host_hours = COALESCE(agency_performance.total_host_hours, 0) + _duration_hours,
        updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION public.start_private_call(
  p_caller_id uuid,
  p_receiver_id uuid,
  p_call_type text DEFAULT 'video'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_balance integer;
  _coins_per_minute integer;
  _host_level integer;
  _call_id uuid;
  _settings jsonb;
  _level_rates jsonb;
  _default_rate integer := 2000;
BEGIN
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  IF _settings IS NOT NULL THEN
    _default_rate := COALESCE((_settings->>'default_rate')::integer, 2000);
    _level_rates := _settings->'level_rates';
  END IF;
  
  SELECT diamond_balance INTO _caller_balance
  FROM profiles WHERE id = p_caller_id;
  
  IF _caller_balance IS NULL OR _caller_balance < _default_rate THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'required', _default_rate, 'current', COALESCE(_caller_balance, 0));
  END IF;
  
  SELECT host_level INTO _host_level FROM profiles WHERE id = p_receiver_id;
  _coins_per_minute := _default_rate;
  
  IF _level_rates IS NOT NULL AND _host_level IS NOT NULL THEN
    DECLARE
      _rate_entry jsonb;
    BEGIN
      FOR _rate_entry IN SELECT * FROM jsonb_array_elements(_level_rates)
      LOOP
        IF (_rate_entry->>'level')::integer = _host_level THEN
          _coins_per_minute := (_rate_entry->>'rate')::integer;
          EXIT;
        END IF;
      END LOOP;
    END;
  END IF;

  INSERT INTO private_calls (caller_id, host_id, call_type, status, coins_per_minute)
  VALUES (p_caller_id, p_receiver_id, p_call_type, 'ringing', _coins_per_minute)
  RETURNING id INTO _call_id;
  
  UPDATE profiles SET is_in_call = true, current_call_id = _call_id WHERE id = p_caller_id;
  
  RETURN jsonb_build_object('success', true, 'call_id', _call_id, 'coins_per_minute', _coins_per_minute);
END;
$$;


CREATE OR REPLACE FUNCTION public.accept_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_id UUID;
  _stream_id UUID;
BEGIN
  SELECT host_id, stream_id INTO _host_id, _stream_id
  FROM private_calls
  WHERE id = _call_id AND status = 'ringing';
  
  IF _host_id IS NULL OR _host_id != auth.uid() THEN
    RAISE EXCEPTION 'Invalid call or not authorized';
  END IF;
  
  UPDATE private_calls
  SET status = 'connected', connected_at = now()
  WHERE id = _call_id;
  
  UPDATE profiles
  SET is_in_call = true, current_call_id = _call_id, updated_at = now()
  WHERE id = _host_id;
  
  IF _stream_id IS NOT NULL THEN
    UPDATE live_streams
    SET is_active = false, ended_at = now()
    WHERE id = _stream_id;
  END IF;
  
  RETURN TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.end_private_call(_call_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call RECORD;
  _duration_seconds INTEGER;
  _duration_minutes DECIMAL;
  _total_cost INTEGER;
  _host_percent DECIMAL;
  _beans_earned INTEGER;
BEGIN
  SELECT * INTO _call FROM private_calls WHERE id = _call_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  IF _call.status = 'ended' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call already ended');
  END IF;
  
  _duration_seconds := EXTRACT(EPOCH FROM (now() - COALESCE(_call.connected_at, _call.created_at)))::INTEGER;
  _duration_minutes := GREATEST(CEIL(_duration_seconds / 60.0), 1);
  _total_cost := (_duration_minutes * COALESCE(_call.coins_per_minute, 0))::INTEGER;
  
  _host_percent := public.get_effective_host_percent();
  _beans_earned := FLOOR(_total_cost * _host_percent / 100)::INTEGER;
  
  UPDATE private_calls
  SET status = 'ended', ended_at = now(), duration_seconds = _duration_seconds, total_coins_spent = _total_cost, host_earned_beans = _beans_earned
  WHERE id = _call_id;
  
  UPDATE profiles SET is_in_call = false, current_call_id = NULL WHERE id IN (_call.caller_id, _call.host_id);
  
  IF _total_cost > 0 THEN
    UPDATE profiles SET coins = GREATEST(coins - _total_cost, 0) WHERE id = _call.caller_id;
  END IF;
  
  IF _beans_earned > 0 THEN
    UPDATE profiles SET beans = COALESCE(beans, 0) + _beans_earned, pending_earnings = COALESCE(pending_earnings, 0) + _beans_earned WHERE id = _call.host_id;
  END IF;
  
  RETURN jsonb_build_object('success', true, 'duration_seconds', _duration_seconds, 'total_cost', _total_cost, 'beans_earned', _beans_earned);
END;
$$;


CREATE OR REPLACE FUNCTION public.decline_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call RECORD;
BEGIN
  SELECT * INTO _call FROM private_calls WHERE id = _call_id AND status = 'ringing';
  IF NOT FOUND THEN RETURN FALSE; END IF;
  
  UPDATE private_calls SET status = 'declined', ended_at = now() WHERE id = _call_id;
  UPDATE profiles SET is_in_call = false, current_call_id = NULL WHERE id IN (_call.caller_id, _call.host_id);
  
  RETURN TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.search_user_by_id(_search_id text)
RETURNS TABLE(id uuid, display_name text, avatar_url text, app_uid varchar, is_host boolean, is_online boolean, user_level integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.app_uid, p.is_host, p.is_online, p.user_level
  FROM profiles p
  WHERE p.app_uid = _search_id
     OR p.id::text = _search_id
  LIMIT 5;
END;
$$;


CREATE OR REPLACE FUNCTION public.transfer_coins_to_user(_sender_id uuid, _receiver_id uuid, _amount integer, _note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _sender_id = _receiver_id THEN RAISE EXCEPTION 'Cannot transfer to yourself'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  UPDATE profiles SET coins = coins - _amount WHERE id = _sender_id AND coins >= _amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance'; END IF;
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id;
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, notes) VALUES (_sender_id, _receiver_id, _amount, _note);
  RETURN TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_agency_transfer_history(
  _agency_id uuid,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  host_id uuid,
  host_name text,
  host_uid varchar,
  amount numeric,
  gift_earnings numeric,
  call_earnings numeric,
  commission_rate numeric,
  transfer_type text,
  status text,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    aet.id, aet.host_id, aet.host_name, aet.host_uid,
    aet.amount, aet.gift_earnings, aet.call_earnings,
    aet.commission_rate, aet.transfer_type, aet.status,
    aet.period_start, aet.period_end, aet.created_at
  FROM agency_earnings_transfers aet
  WHERE aet.agency_id = _agency_id
  ORDER BY aet.created_at DESC
  LIMIT _limit OFFSET _offset;
END;
$$;


CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE group_chat_rooms SET member_count = COALESCE(member_count, 0) + 1 WHERE id = NEW.room_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE group_chat_rooms SET member_count = GREATEST(COALESCE(member_count, 0) - 1, 0) WHERE id = OLD.room_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION public.search_group_by_code(_code text)
RETURNS TABLE(id uuid, name text, avatar_url text, member_count integer, group_code text, is_public boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT g.id, g.name, g.avatar_url, g.member_count, g.group_code, g.is_public
  FROM group_chat_rooms g
  WHERE g.group_code = _code AND g.is_active = true
  LIMIT 1;
END;
$$;


CREATE OR REPLACE FUNCTION public.update_room_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE party_rooms SET current_participants = COALESCE(current_participants, 0) + 1 WHERE id = NEW.room_id;
  ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.left_at IS NOT NULL AND OLD.left_at IS NULL) THEN
    UPDATE party_rooms SET current_participants = GREATEST(COALESCE(current_participants, 0) - 1, 0) WHERE id = COALESCE(NEW.room_id, OLD.room_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION public.calculate_user_level(_total_consumption bigint)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE
    WHEN _total_consumption >= 30000000000 THEN 50
    WHEN _total_consumption >= 10000000000 THEN 40
    WHEN _total_consumption >= 3000000000 THEN 30
    WHEN _total_consumption >= 1000000000 THEN 20
    WHEN _total_consumption >= 300000000 THEN 10
    WHEN _total_consumption >= 100000000 THEN 9
    WHEN _total_consumption >= 30000000 THEN 8
    WHEN _total_consumption >= 10000000 THEN 7
    WHEN _total_consumption >= 3000000 THEN 6
    WHEN _total_consumption >= 1000000 THEN 5
    WHEN _total_consumption >= 300000 THEN 4
    WHEN _total_consumption >= 100000 THEN 3
    WHEN _total_consumption >= 30000 THEN 2
    WHEN _total_consumption >= 10000 THEN 1
    ELSE 0
  END;
END;
$$;


CREATE OR REPLACE FUNCTION public.create_guest_profile(_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _guest_uid varchar(12);
BEGIN
  _guest_uid := public.generate_app_uid();
  RETURN jsonb_build_object('guest_uid', _guest_uid, 'device_id', _device_id);
END;
$$;


CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = _user_id AND role::text = _role AND is_active = true
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = _user_id AND is_active = true
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.log_admin_action(_action_type text, _target_type text DEFAULT NULL, _target_id uuid DEFAULT NULL, _details jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid()::text, _action_type, _target_type, _target_id::text, _details);
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_block_user(_user_id uuid, _block boolean, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _block THEN
    UPDATE public.profiles
    SET is_blocked = true, blocked_at = now(), blocked_reason = _reason,
        is_host = false, user_level = 0, host_level = 0, is_online = false,
        is_verified = false, is_face_verified = false, face_verified_at = NULL,
        host_status = 'inactive', total_earnings = 0, pending_earnings = 0, last_seen_at = now()
    WHERE id = _user_id;
    UPDATE public.agency_hosts SET status = 'left', left_at = now() WHERE host_id = _user_id AND status = 'active';
  ELSE
    UPDATE public.profiles SET is_blocked = false, blocked_at = NULL, blocked_reason = NULL WHERE id = _user_id;
  END IF;
  PERFORM public.log_admin_action(CASE WHEN _block THEN 'block_user' ELSE 'unblock_user' END, 'user', _user_id, jsonb_build_object('reason', _reason));
  RETURN TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_block_agency(_agency_id uuid, _block boolean, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.agencies
  SET is_blocked = _block,
      blocked_at = CASE WHEN _block THEN now() ELSE NULL END,
      blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
      is_active = NOT _block
  WHERE id = _agency_id;
  PERFORM public.log_admin_action(CASE WHEN _block THEN 'block_agency' ELSE 'unblock_agency' END, 'agency', _agency_id, jsonb_build_object('reason', _reason));
  RETURN TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  
  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'total_hosts', (SELECT COUNT(*) FROM profiles WHERE is_host = true),
    'total_agencies', (SELECT COUNT(*) FROM agencies WHERE is_active = true),
    'online_users', (SELECT COUNT(*) FROM profiles WHERE is_online = true),
    'active_streams', (SELECT COUNT(*) FROM live_streams WHERE is_active = true),
    'pending_verifications', (SELECT COUNT(*) FROM face_verification_submissions WHERE status = 'pending'),
    'pending_withdrawals', (SELECT COUNT(*) FROM agency_withdrawals WHERE status = 'pending'),
    'today_new_users', (SELECT COUNT(*) FROM profiles WHERE created_at >= CURRENT_DATE),
    'today_revenue', (SELECT COALESCE(SUM(coins_amount), 0) FROM coin_transactions WHERE created_at >= CURRENT_DATE AND transaction_type = 'purchase')
  ) INTO result;
  
  RETURN result;
END;
$$;


CREATE OR REPLACE FUNCTION public.validate_user_task_progress_claim(
  _user_id uuid,
  _task_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task RECORD;
  _progress RECORD;
BEGIN
  SELECT * INTO _task FROM daily_tasks WHERE id = _task_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Task not found');
  END IF;

  SELECT * INTO _progress FROM user_task_progress 
  WHERE user_id = _user_id AND task_id = _task_id AND task_date = CURRENT_DATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'No progress found');
  END IF;

  IF _progress.is_claimed THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Already claimed');
  END IF;

  IF _progress.current_count < COALESCE(_task.required_count, 1) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Task not completed');
  END IF;

  RETURN jsonb_build_object('valid', true, 'reward_coins', _task.reward_coins, 'reward_xp', _task.reward_xp);
END;
$$;


CREATE OR REPLACE FUNCTION public.claim_task_reward(
  _user_id uuid,
  _task_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _validation jsonb;
  _reward_coins integer;
  _reward_xp integer;
BEGIN
  _validation := public.validate_user_task_progress_claim(_user_id, _task_id);
  
  IF NOT (_validation->>'valid')::boolean THEN
    RETURN _validation;
  END IF;
  
  _reward_coins := COALESCE((_validation->>'reward_coins')::integer, 0);
  _reward_xp := COALESCE((_validation->>'reward_xp')::integer, 0);
  
  UPDATE user_task_progress SET is_claimed = true, claimed_at = now() 
  WHERE user_id = _user_id AND task_id = _task_id AND task_date = CURRENT_DATE;
  
  IF _reward_coins > 0 THEN
    UPDATE profiles SET coins = COALESCE(coins, 0) + _reward_coins WHERE id = _user_id;
  END IF;
  
  RETURN jsonb_build_object('success', true, 'coins_rewarded', _reward_coins, 'xp_rewarded', _reward_xp);
END;
$$;


CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host RECORD;
  _transfer_count integer := 0;
  _total_transferred numeric := 0;
  _host_percent numeric;
  _period_start timestamp;
  _period_end timestamp;
BEGIN
  _host_percent := public.get_effective_host_percent();
  _period_start := date_trunc('week', now() - interval '7 days');
  _period_end := date_trunc('week', now());
  
  FOR _host IN
    SELECT p.id, p.display_name, p.app_uid, ah.agency_id, a.name as agency_name, a.commission_rate,
           COALESCE(p.pending_earnings, 0) as pending
    FROM profiles p
    JOIN agency_hosts ah ON ah.host_id = p.id AND ah.status = 'active'
    JOIN agencies a ON a.id = ah.agency_id AND a.is_active = true
    WHERE COALESCE(p.pending_earnings, 0) > 0
  LOOP
    INSERT INTO agency_earnings_transfers (agency_id, host_id, host_name, host_uid, amount, commission_rate, transfer_type, status, period_start, period_end, agency_name)
    VALUES (_host.agency_id, _host.id, _host.display_name, _host.app_uid, _host.pending, _host.commission_rate, 'weekly_auto', 'completed', _period_start, _period_end, _host.agency_name);
    
    UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + _host.pending WHERE id = _host.agency_id;
    UPDATE profiles SET pending_earnings = 0, weekly_earnings = 0 WHERE id = _host.id;
    
    _transfer_count := _transfer_count + 1;
    _total_transferred := _total_transferred + _host.pending;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'transfers', _transfer_count, 'total', _total_transferred);
END;
$$;


CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  _agency_id uuid,
  _amount numeric,
  _payment_method text DEFAULT 'bank_transfer',
  _payment_details jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance numeric;
  _withdrawal_id uuid;
  _platform_fee numeric;
  _net_amount numeric;
BEGIN
  SELECT beans_balance INTO _current_balance FROM agencies WHERE id = _agency_id;
  
  IF _current_balance IS NULL OR _current_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  _platform_fee := ROUND(_amount * 0.05, 0);
  _net_amount := _amount - _platform_fee;
  
  UPDATE agencies SET beans_balance = beans_balance - _amount WHERE id = _agency_id;
  
  INSERT INTO agency_withdrawals (agency_id, amount, payment_method, payment_details, status)
  VALUES (_agency_id, _amount, _payment_method, _payment_details || jsonb_build_object('platform_fee', _platform_fee, 'net_withdrawal_beans', _net_amount), 'pending')
  RETURNING id INTO _withdrawal_id;
  
  RETURN jsonb_build_object('success', true, 'withdrawal_id', _withdrawal_id, 'amount', _amount, 'fee', _platform_fee, 'net', _net_amount);
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_remove_host_from_agency(_host_id uuid, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT agency_id INTO _agency_id FROM agency_hosts WHERE host_id = _host_id AND status = 'active';
  IF _agency_id IS NULL THEN RETURN FALSE; END IF;
  UPDATE agency_hosts SET status = 'left', left_at = now() WHERE host_id = _host_id AND status = 'active';
  UPDATE profiles SET agency_id = NULL WHERE id = _host_id;
  UPDATE agencies SET total_hosts = GREATEST(total_hosts - 1, 0) WHERE id = _agency_id;
  PERFORM public.log_admin_action('remove_host_from_agency', 'agency_host', _host_id, jsonb_build_object('agency_id', _agency_id, 'reason', _reason));
  RETURN TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_add_agency_coins(_agency_id uuid, _amount numeric, _note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _amount WHERE id = _agency_id;
  PERFORM public.log_admin_action('add_agency_coins', 'agency', _agency_id, jsonb_build_object('amount', _amount, 'note', _note));
  RETURN TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_update_agency_level(_agency_id uuid, _new_level text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO _tier FROM agency_level_tiers WHERE level_code = _new_level AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid level code'; END IF;
  UPDATE agencies SET level = _new_level, commission_rate = _tier.commission_rate, updated_at = now() WHERE id = _agency_id;
  PERFORM public.log_admin_action('update_agency_level', 'agency', _agency_id, jsonb_build_object('new_level', _new_level, 'commission_rate', _tier.commission_rate));
  RETURN TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _withdrawal RECORD;
  _net_beans NUMERIC;
BEGIN
  SELECT * INTO _withdrawal FROM agency_withdrawals WHERE id = _withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found'); END IF;
  IF _withdrawal.status NOT IN ('pending', 'processing') THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition'); END IF;
  
  IF _status = 'approved' THEN
    _net_beans := COALESCE((_withdrawal.payment_details->>'net_withdrawal_beans')::NUMERIC, _withdrawal.amount * 0.95);
    UPDATE agency_withdrawals SET status = _status, notes = _notes, processed_at = NOW() WHERE id = _withdrawal_id;
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal approved');
  ELSE
    UPDATE agency_withdrawals SET status = _status, notes = _notes, processed_at = NOW() WHERE id = _withdrawal_id;
    IF _status = 'rejected' THEN
      UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + _withdrawal.amount WHERE id = _withdrawal.agency_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal ' || _status);
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.generate_app_uid()
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_uid VARCHAR(12);
  uid_exists BOOLEAN;
BEGIN
  LOOP
    new_uid := 'LV' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE app_uid = new_uid) INTO uid_exists;
    EXIT WHEN NOT uid_exists;
  END LOOP;
  RETURN new_uid;
END;
$$;


CREATE OR REPLACE FUNCTION public.assign_app_uid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.app_uid IS NULL OR NEW.app_uid = '' THEN
    NEW.app_uid := public.generate_app_uid();
  END IF;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.search_user_by_app_uid(_app_uid text)
RETURNS TABLE(id uuid, display_name text, avatar_url text, app_uid varchar, is_host boolean, is_online boolean, user_level integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.app_uid, p.is_host, p.is_online, p.user_level
  FROM profiles p
  WHERE p.app_uid = _app_uid
  LIMIT 1;
END;
$$;


CREATE OR REPLACE FUNCTION public.generate_sub_agent_referral_code(_agency_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _exists boolean;
BEGIN
  LOOP
    _code := 'SA' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM sub_agents WHERE referral_code = _code) INTO _exists;
    EXIT WHEN NOT _exists;
  END LOOP;
  RETURN _code;
END;
$$;


CREATE OR REPLACE FUNCTION public.create_sub_agent(
  _agency_id uuid,
  _user_id uuid,
  _name text,
  _commission_rate numeric DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub_agent_id uuid;
  _referral_code text;
BEGIN
  _referral_code := public.generate_sub_agent_referral_code(_agency_id);
  
  INSERT INTO sub_agents (agency_id, user_id, name, commission_rate, referral_code, status)
  VALUES (_agency_id, _user_id, _name, _commission_rate, _referral_code, 'active')
  RETURNING id INTO _sub_agent_id;
  
  UPDATE agencies SET total_agents = COALESCE(total_agents, 0) + 1 WHERE id = _agency_id;
  
  RETURN _sub_agent_id;
END;
$$;
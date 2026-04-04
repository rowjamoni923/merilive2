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
    AND (participant_1 = _user_id OR participant_2 = _user_id)
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

CREATE OR REPLACE FUNCTION public.get_agency_by_code(agency_code text)
RETURNS TABLE(id uuid, name text, level text, total_hosts integer)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- First try exact match
  RETURN QUERY
  SELECT a.id, a.name, a.level, a.total_hosts
  FROM public.agencies a
  WHERE upper(trim(a.agency_code)) = upper(trim(get_agency_by_code.agency_code))
    AND a.is_active = true
    AND (a.is_blocked IS NULL OR a.is_blocked = false)
  LIMIT 1;

  -- If no exact match found, try fuzzy match (0↔O, 1↔I↔L)
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT a.id, a.name, a.level, a.total_hosts
    FROM public.agencies a
    WHERE a.is_active = true
      AND (a.is_blocked IS NULL OR a.is_blocked = false)
      AND translate(upper(trim(a.agency_code)), 'OIL', '011') = translate(upper(trim(get_agency_by_code.agency_code)), 'OIL', '011')
    LIMIT 1;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_agency(_host_id uuid, _agency_code text, _joined_via text DEFAULT 'code'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_id uuid;
  v_normalized_code text;
  v_existing record;
  v_agency_owner_id uuid;
  v_agency_name text;
  v_host_name text;
  v_sub_agent_code text := NULL;
BEGIN
  v_normalized_code := upper(trim(_agency_code));

  -- First try: match against agency_code directly
  SELECT id, owner_id, name INTO v_agency_id, v_agency_owner_id, v_agency_name
  FROM agencies
  WHERE upper(trim(agency_code)) = v_normalized_code
    AND is_active = true;

  -- Second try: if not found, check if it's a sub-agent referral code
  IF v_agency_id IS NULL THEN
    SELECT sa.agency_id, a.owner_id, a.name, sa.referral_code
    INTO v_agency_id, v_agency_owner_id, v_agency_name, v_sub_agent_code
    FROM sub_agents sa
    JOIN agencies a ON a.id = sa.agency_id
    WHERE upper(trim(sa.referral_code)) = v_normalized_code
      AND sa.status = 'active'
      AND a.is_active = true;
  END IF;

  IF v_agency_id IS NULL THEN
    RAISE EXCEPTION 'Agency not found. Please check the code and try again.';
  END IF;

  -- Check if user already owns an agency
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _host_id AND is_agency_owner = true) THEN
    RAISE EXCEPTION 'You already own an agency. Agency owners cannot join another agency as a host.';
  END IF;

  -- Get existing record for this host
  SELECT id, status, agency_id INTO v_existing
  FROM agency_hosts
  WHERE host_id = _host_id;

  IF v_existing IS NOT NULL THEN
    IF v_existing.status = 'active' THEN
      RAISE EXCEPTION 'You are already an active member of an agency. Please leave your current agency first.';
    END IF;
    IF v_existing.status = 'pending' AND v_existing.agency_id = v_agency_id THEN
      RAISE EXCEPTION 'You have already applied to this agency. Please wait for approval.';
    END IF;
    IF v_existing.status = 'pending' AND v_existing.agency_id != v_agency_id THEN
      RAISE EXCEPTION 'You have already applied to another agency. Please cancel that request first before applying to a new one.';
    END IF;
    DELETE FROM agency_hosts WHERE id = v_existing.id;
  END IF;

  -- Create join request (store sub-agent referral code if applicable)
  INSERT INTO agency_hosts (host_id, agency_id, status, joined_via, joined_at, referral_code)
  VALUES (_host_id, v_agency_id, 'pending', _joined_via, NOW(), v_sub_agent_code);

  -- Get host display name
  SELECT COALESCE(display_name, 'Unknown User') INTO v_host_name
  FROM profiles WHERE id = _host_id;

  -- Send notification to agency owner
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (
    v_agency_owner_id,
    'agency_host_request',
    '👥 New Host Request',
    v_host_name || ' wants to join your agency ' || v_agency_name ||
      CASE WHEN v_sub_agent_code IS NOT NULL THEN ' (via Sub-Agent: ' || v_sub_agent_code || ')' ELSE '' END,
    jsonb_build_object(
      'host_id', _host_id,
      'host_name', v_host_name,
      'agency_id', v_agency_id,
      'agency_name', v_agency_name,
      'referral_code', COALESCE(v_sub_agent_code, ''),
      'action_url', '/agency-dashboard'
    ),
    false
  );

  RETURN true;
END;
$function$;

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
  -- Calculate period start based on period type
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
  -- Get the host's agency
  SELECT agency_id INTO _host_agency_id
  FROM public.profiles
  WHERE id = NEW.receiver_id;
  
  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch dynamic rates from app_settings (with safe defaults)
  SELECT COALESCE((setting_value)::numeric, 9000) INTO _beans_per_dollar
  FROM public.app_settings WHERE setting_key = 'beans_per_dollar';
  IF _beans_per_dollar IS NULL OR _beans_per_dollar <= 0 THEN
    _beans_per_dollar := 9000;
  END IF;

  SELECT COALESCE((setting_value)::numeric, 55) INTO _host_share
  FROM public.app_settings WHERE setting_key = 'host_percent';
  IF _host_share IS NULL OR _host_share <= 0 THEN
    _host_share := 55;
  END IF;

  -- Convert coins to USD: (coins × host_share%) / beans_per_dollar
  _usd_amount := ROUND((NEW.coin_amount * (_host_share / 100.0)) / _beans_per_dollar, 2);
  
  -- Get current week start
  _period_start := date_trunc('week', CURRENT_DATE)::date;
  
  -- Update or insert weekly performance with USD amount
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
    -- Increment viewer count for new viewer
    UPDATE public.live_streams
    SET viewer_count = COALESCE(viewer_count, 0) + 1
    WHERE id = NEW.stream_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
      -- Decrement viewer count when viewer leaves
      UPDATE public.live_streams
      SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0)
      WHERE id = NEW.stream_id;
    ELSIF NEW.left_at IS NULL AND OLD.left_at IS NOT NULL THEN
      -- Increment viewer count when viewer returns (left_at was set, now null)
      UPDATE public.live_streams
      SET viewer_count = COALESCE(viewer_count, 0) + 1
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
    -- Calculate stream duration in hours
    _duration_hours := EXTRACT(EPOCH FROM (NEW.ended_at - COALESCE(NEW.started_at, NEW.created_at))) / 3600;
    
    -- Get the host's agency
    SELECT agency_id INTO _host_agency_id
    FROM public.profiles
    WHERE id = NEW.host_id;
    
    IF _host_agency_id IS NOT NULL THEN
      _period_start := date_trunc('week', CURRENT_DATE)::date;
      
      -- Update agency performance with host hours
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

CREATE OR REPLACE FUNCTION public.start_private_call(_host_id uuid, _stream_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _caller_id uuid;
  _call_id uuid;
  _host_call_rate integer;
  _host_level integer;
  _host_custom_rate integer;
  _call_settings jsonb;
  _admin_min_rate integer;
  _admin_max_rate integer;
  _min_level_for_custom integer;
  _level_rate jsonb;
  _i integer;
  _is_level_rate boolean := false;
BEGIN
  _caller_id := auth.uid();
  
  IF _caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF _caller_id = _host_id THEN
    RAISE EXCEPTION 'Cannot call yourself';
  END IF;
  
  -- ✅ FIX: Auto-cancel ANY stale pending/ringing calls from this caller to this host
  -- This prevents old calls from being picked up by polling/broadcast
  UPDATE private_calls 
  SET status = 'ended', 
      ended_at = now(), 
      end_reason = 'cancelled_by_new_call',
      updated_at = now()
  WHERE caller_id = _caller_id 
    AND host_id = _host_id 
    AND status IN ('pending', 'ringing');
  
  -- ✅ FIX: Also cancel any stale calls where this caller is involved
  UPDATE private_calls 
  SET status = 'ended', 
      ended_at = now(), 
      end_reason = 'cancelled_stale',
      updated_at = now()
  WHERE caller_id = _caller_id 
    AND status IN ('pending', 'ringing')
    AND created_at < now() - interval '60 seconds';

  -- ✅ FIX: Cancel stale calls where host is the receiver
  UPDATE private_calls 
  SET status = 'ended', 
      ended_at = now(), 
      end_reason = 'cancelled_stale',
      updated_at = now()
  WHERE host_id = _host_id 
    AND status IN ('pending', 'ringing')
    AND created_at < now() - interval '60 seconds';
  
  -- Reset is_in_call for both users before checking
  UPDATE profiles SET is_in_call = false, current_call_id = null, updated_at = now()
  WHERE id = _caller_id 
    AND is_in_call = true
    AND (current_call_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM private_calls WHERE id = current_call_id AND status IN ('connected', 'ringing')
    ));

  UPDATE profiles SET is_in_call = false, current_call_id = null, updated_at = now()
  WHERE id = _host_id 
    AND is_in_call = true
    AND (current_call_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM private_calls WHERE id = current_call_id AND status IN ('connected', 'ringing')
    ));
  
  -- Check if caller is GENUINELY in an active call
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _caller_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'You are already in a call';
  END IF;
  
  -- Check if host is GENUINELY in an active call
  IF EXISTS (SELECT 1 FROM profiles WHERE id = _host_id AND is_in_call = true) THEN
    RAISE EXCEPTION 'Host is busy in another call';
  END IF;
  
  -- CRITICAL: Get admin settings
  SELECT setting_value INTO _call_settings
  FROM app_settings WHERE setting_key = 'call_rates';
  
  IF _call_settings IS NULL THEN
    RAISE EXCEPTION 'CRITICAL: call_rates not configured in Admin Panel!';
  END IF;
  
  _admin_min_rate := (_call_settings->>'min_rate')::integer;
  _admin_max_rate := (_call_settings->>'max_rate')::integer;
  
  _min_level_for_custom := COALESCE(
    (_call_settings->>'min_level_for_custom_rate')::integer,
    (_call_settings->>'min_level_for_custom')::integer,
    3
  );
  
  IF _admin_min_rate IS NULL OR _admin_max_rate IS NULL THEN
    RAISE EXCEPTION 'CRITICAL: min_rate and max_rate must be configured!';
  END IF;
  
  -- FIX: Use host_level (not user_level) for hosts to determine correct rate
  SELECT host_level, call_rate_per_minute INTO _host_level, _host_custom_rate
  FROM profiles WHERE id = _host_id;
  
  _host_level := COALESCE(_host_level, 0);
  
  -- PRIORITY 1: Host custom rate (only if level >= min_level_for_custom)
  IF _host_custom_rate IS NOT NULL AND _host_custom_rate > 0 AND _host_level >= _min_level_for_custom THEN
    _host_call_rate := GREATEST(_admin_min_rate, LEAST(_host_custom_rate, _admin_max_rate));
  ELSE
    -- PRIORITY 2: Level-based rate from admin settings
    IF _call_settings->'level_rates' IS NOT NULL AND jsonb_array_length(_call_settings->'level_rates') > 0 THEN
      FOR _i IN 0..jsonb_array_length(_call_settings->'level_rates') - 1 LOOP
        _level_rate := _call_settings->'level_rates'->_i;
        IF (_level_rate->>'level')::integer = _host_level THEN
          _host_call_rate := (_level_rate->>'rate')::integer;
          _is_level_rate := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;
    
    -- If no exact level match found, use default_rate from admin
    IF NOT _is_level_rate OR _host_call_rate IS NULL THEN
      _host_call_rate := COALESCE((_call_settings->>'default_rate')::integer, 0);
      IF _host_call_rate <= 0 THEN
        RAISE EXCEPTION 'No call rate configured for host level %', _host_level;
      END IF;
    END IF;
  END IF;
  
  IF _host_call_rate IS NULL OR _host_call_rate <= 0 THEN
    RAISE EXCEPTION 'Invalid call rate';
  END IF;
  
  -- Create the call
  INSERT INTO private_calls (caller_id, host_id, stream_id, status, started_at, coins_per_minute)
  VALUES (_caller_id, _host_id, _stream_id, 'ringing', now(), _host_call_rate)
  RETURNING id INTO _call_id;
  
  -- Mark BOTH caller and host as in_call immediately
  UPDATE profiles SET is_in_call = true, current_call_id = _call_id, updated_at = now()
  WHERE id IN (_caller_id, _host_id);
  
  RETURN _call_id;
END;
$function$;

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
  -- Get call info and verify host
  SELECT host_id, stream_id INTO _host_id, _stream_id
  FROM private_calls
  WHERE id = _call_id AND status = 'ringing';
  
  IF _host_id IS NULL OR _host_id != auth.uid() THEN
    RAISE EXCEPTION 'Invalid call or not authorized';
  END IF;
  
  -- Update call status to connected
  UPDATE private_calls
  SET status = 'connected', connected_at = now()
  WHERE id = _call_id;
  
  -- Update host status
  UPDATE profiles
  SET is_in_call = true, current_call_id = _call_id, updated_at = now()
  WHERE id = _host_id;
  
  -- If there was a stream, end it (convert to private call)
  IF _stream_id IS NOT NULL THEN
    UPDATE live_streams
    SET is_active = false, ended_at = now()
    WHERE id = _stream_id;
  END IF;
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_accepted', jsonb_build_object('host_id', _host_id));
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_private_call(_call_id uuid, _end_reason text DEFAULT 'normal'::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id UUID;
  _host_id UUID;
  _started_at TIMESTAMP WITH TIME ZONE;
  _connected_at TIMESTAMP WITH TIME ZONE;
  _duration INTEGER;
  _total_deducted INTEGER;
  _host_earned_val INTEGER;
  _call_status TEXT;
BEGIN
  -- Get call info
  SELECT caller_id, host_id, started_at, connected_at, status,
         COALESCE(total_coins_deducted, 0), COALESCE(host_earned, 0)
  INTO _caller_id, _host_id, _started_at, _connected_at, _call_status,
       _total_deducted, _host_earned_val
  FROM private_calls
  WHERE id = _call_id AND status IN ('ringing', 'connected');
  
  IF _caller_id IS NULL THEN
    -- Call already ended or not found - still reset is_in_call as safety
    UPDATE profiles 
    SET is_in_call = false, current_call_id = NULL 
    WHERE current_call_id = _call_id;
    RETURN FALSE;
  END IF;
  
  -- Verify user is participant
  IF auth.uid() != _caller_id AND auth.uid() != _host_id THEN
    RAISE EXCEPTION 'Not authorized to end this call';
  END IF;
  
  -- Calculate accurate duration from connected_at
  IF _connected_at IS NOT NULL THEN
    _duration := EXTRACT(EPOCH FROM (now() - _connected_at))::INTEGER;
  ELSIF _started_at IS NOT NULL THEN
    _duration := EXTRACT(EPOCH FROM (now() - _started_at))::INTEGER;
  ELSE
    _duration := 0;
  END IF;
  
  -- Update call status - DO NOT re-deduct coins (per-minute billing already did that)
  UPDATE private_calls
  SET 
    status = 'ended',
    ended_at = now(),
    end_reason = _end_reason,
    duration_seconds = _duration
  WHERE id = _call_id;
  
  -- INSTANTLY reset BOTH caller and host is_in_call flags
  UPDATE profiles
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE id IN (_caller_id, _host_id);
  
  -- Update call stats (no coin deduction, just counters)
  UPDATE profiles
  SET total_calls_made = COALESCE(total_calls_made, 0) + 1
  WHERE id = _caller_id;
  
  UPDATE profiles
  SET total_calls_received = COALESCE(total_calls_received, 0) + 1,
      total_call_minutes = COALESCE(total_call_minutes, 0) + CEIL(GREATEST(_duration, 0)::DECIMAL / 60)
  WHERE id = _host_id;
  
  -- Log event
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_ended', jsonb_build_object(
    'end_reason', _end_reason,
    'duration_seconds', _duration,
    'total_coins_deducted', _total_deducted,
    'host_earned', _host_earned_val,
    'ended_by', auth.uid()
  ));
  
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decline_private_call(_call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id UUID;
  _host_id UUID;
BEGIN
  SELECT caller_id, host_id INTO _caller_id, _host_id
  FROM private_calls
  WHERE id = _call_id AND status = 'ringing';
  
  IF _host_id IS NULL OR _host_id != auth.uid() THEN
    RAISE EXCEPTION 'Invalid call or not authorized';
  END IF;
  
  UPDATE private_calls
  SET status = 'declined', ended_at = now(), end_reason = 'declined'
  WHERE id = _call_id;
  
  -- ✅ Reset BOTH caller and host
  UPDATE profiles
  SET is_in_call = false, current_call_id = NULL
  WHERE id IN (_caller_id, _host_id);
  
  INSERT INTO call_events (call_id, event_type, event_data)
  VALUES (_call_id, 'call_declined', jsonb_build_object('host_id', _host_id));
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_user_by_id(_search_query TEXT)
RETURNS TABLE(
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  is_host BOOLEAN,
  is_verified BOOLEAN
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.is_host,
    p.is_verified
  FROM public.profiles p
  WHERE 
    p.id::text ILIKE '%' || _search_query || '%'
    OR p.username ILIKE '%' || _search_query || '%'
    OR p.display_name ILIKE '%' || _search_query || '%'
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.transfer_coins_to_user(
  _receiver_id UUID,
  _amount INTEGER,
  _note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sender_id UUID;
  _agency_id UUID;
  _agency_balance INTEGER;
  _transfer_id UUID;
  _sender_face_verified BOOLEAN;
BEGIN
  _sender_id := auth.uid();
  
  -- Check if sender has completed face verification
  SELECT is_face_verified INTO _sender_face_verified
  FROM public.profiles
  WHERE id = _sender_id;
  
  IF _sender_face_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Face verification required to transfer beans. Please complete face verification first.';
  END IF;
  
  -- Check if sender is an agency owner
  SELECT id, wallet_balance INTO _agency_id, _agency_balance
  FROM public.agencies
  WHERE owner_id = _sender_id AND is_active = true;
  
  IF _agency_id IS NULL THEN
    RAISE EXCEPTION 'You are not an agency owner';
  END IF;
  
  -- Check minimum transfer amount
  IF _amount < 10000 THEN
    RAISE EXCEPTION 'Minimum transfer amount is 10,000 coins';
  END IF;
  
  -- Check if agency has enough balance
  IF _agency_balance < _amount THEN
    RAISE EXCEPTION 'Insufficient agency balance';
  END IF;
  
  -- Check if receiver exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _receiver_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Create transfer record
  INSERT INTO public.coin_transfers (sender_id, sender_type, receiver_id, amount, note, status)
  VALUES (_sender_id, 'agency', _receiver_id, _amount, _note, 'completed')
  RETURNING id INTO _transfer_id;
  
  -- Deduct from agency wallet
  UPDATE public.agencies
  SET wallet_balance = wallet_balance - _amount
  WHERE id = _agency_id;
  
  -- Add to user's coins
  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _receiver_id;
  
  RETURN _transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agency_transfer_history(_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  id UUID,
  receiver_id UUID,
  receiver_name TEXT,
  receiver_avatar TEXT,
  amount INTEGER,
  note TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    ct.id,
    ct.receiver_id,
    p.display_name as receiver_name,
    p.avatar_url as receiver_avatar,
    ct.amount,
    ct.note,
    ct.status,
    ct.created_at
  FROM public.coin_transfers ct
  LEFT JOIN public.profiles p ON ct.receiver_id = p.id
  WHERE ct.sender_id = auth.uid()
  ORDER BY ct.created_at DESC
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_group_by_code(_group_code TEXT)
RETURNS TABLE(id UUID, name TEXT, avatar_url TEXT, member_count INTEGER, group_type TEXT, owner_name TEXT, owner_avatar TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    g.id,
    g.name,
    g.avatar_url,
    g.member_count,
    g.group_type,
    p.display_name as owner_name,
    p.avatar_url as owner_avatar
  FROM public.groups g
  LEFT JOIN public.profiles p ON g.owner_id = p.id
  WHERE g.group_code ILIKE '%' || _group_code || '%'
  AND g.is_active = true
  LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION public.update_room_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.party_rooms SET current_participants = current_participants + 1 WHERE id = NEW.room_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
    UPDATE public.party_rooms SET current_participants = GREATEST(current_participants - 1, 0) WHERE id = NEW.room_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.calculate_user_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ 
DECLARE
  target_user_id UUID;
  user_consumption NUMERIC;
  user_earnings NUMERIC;
  is_female_host BOOLEAN;
  new_level INTEGER;
  current_level INTEGER;
BEGIN
  -- Determine target user based on trigger source
  IF TG_TABLE_NAME = 'profiles' THEN
    target_user_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'gift_transactions' THEN
    target_user_id := NEW.sender_id;
  ELSIF TG_TABLE_NAME = 'payment_transactions' OR TG_TABLE_NAME = 'recharge_transactions' THEN
    target_user_id := NEW.user_id;
  ELSE
    target_user_id := COALESCE(NEW.sender_id, NEW.receiver_id, NEW.user_id);
  END IF;
  
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get user's current data
  SELECT 
    COALESCE(p.total_consumption, 0),
    COALESCE(p.total_earnings, 0),
    (p.is_host = true AND p.gender = 'female'),
    COALESCE(p.user_level, 0)
  INTO user_consumption, user_earnings, is_female_host, current_level
  FROM profiles p
  WHERE p.id = target_user_id;
  
  -- Find appropriate level
  IF is_female_host THEN
    -- For female hosts, use earnings
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= user_earnings
    ORDER BY level_number DESC
    LIMIT 1;
  ELSE
    -- For regular users, use total_consumption (total diamonds spent)
    SELECT level_number INTO new_level
    FROM user_level_tiers
    WHERE tier_type = 'user'
      AND is_active = true
      AND min_topup_amount <= user_consumption
    ORDER BY level_number DESC
    LIMIT 1;
  END IF;
  
  new_level := COALESCE(new_level, 0);
  
  -- Update level if different
  IF new_level != current_level THEN
    UPDATE profiles
    SET user_level = new_level, updated_at = now()
    WHERE id = target_user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_guest_profile(
  p_display_name TEXT,
  p_gender TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.profiles
  SET 
    display_name = p_display_name,
    gender = p_gender,
    is_host = (p_gender = 'female'),
    host_status = CASE WHEN p_gender = 'female' THEN 'approved' ELSE NULL END
  WHERE id = p_user_id;
  
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = _user_id 
        AND is_active = true
    )
$$;

CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action_type text,
  _target_type text,
  _target_id uuid,
  _details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), _action_type, _target_type, _target_id::text, _details);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_block_user(
  _user_id uuid,
  _block boolean,
  _reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    IF _block THEN
        UPDATE public.profiles
        SET 
            is_blocked = true,
            blocked_at = now(),
            blocked_reason = _reason,
            is_host = false,
            user_level = 0,
            host_level = 0,
            is_online = false,
            is_verified = false,
            is_face_verified = false,
            face_verified_at = NULL,
            host_status = 'inactive',
            total_earnings = 0,
            pending_earnings = 0,
            last_seen_at = now()
        WHERE id = _user_id;
        
        UPDATE public.agency_hosts
        SET status = 'left', left_at = now()
        WHERE host_id = _user_id AND status = 'active';
    ELSE
        UPDATE public.profiles
        SET 
            is_blocked = false,
            blocked_at = NULL,
            blocked_reason = NULL
        WHERE id = _user_id;
    END IF;
    
    PERFORM public.log_admin_action(
        CASE WHEN _block THEN 'block_user' ELSE 'unblock_user' END,
        'user',
        _user_id,
        jsonb_build_object('reason', _reason)
    );
    
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_block_agency(_agency_id UUID, _block BOOLEAN, _reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    UPDATE public.agencies
    SET 
        is_blocked = _block,
        blocked_at = CASE WHEN _block THEN now() ELSE NULL END,
        blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
        is_active = NOT _block
    WHERE id = _agency_id;
    
    -- Log the action
    PERFORM public.log_admin_action(
        CASE WHEN _block THEN 'block_agency' ELSE 'unblock_agency' END,
        'agency',
        _agency_id,
        jsonb_build_object('reason', _reason)
    );
    
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today timestamp := CURRENT_DATE::timestamp;
  v_today_text text := to_char(CURRENT_DATE, 'YYYY-MM-DD');
  r json;
BEGIN
  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'total_hosts', (SELECT count(*) FROM profiles WHERE is_host=true),
    'total_agencies', (SELECT count(*) FROM agencies WHERE is_active=true),
    'active_streams', (SELECT count(*) FROM live_streams WHERE is_active=true AND ended_at IS NULL),
    'active_party_rooms', (SELECT count(*) FROM party_rooms WHERE is_active=true),
    'total_gifts_today', COALESCE((SELECT sum(coin_amount) FROM gift_transactions WHERE created_at>=v_today),0),
    'total_calls_today', (SELECT count(*) FROM private_calls WHERE created_at>=v_today),
    'online_users', (SELECT count(*) FROM profiles WHERE is_online=true),
    'blocked_users', (SELECT count(*) FROM profiles WHERE is_blocked=true),
    'blocked_agencies', (SELECT count(*) FROM agencies WHERE is_blocked=true),
    'pending_host_applications', (SELECT count(*) FROM face_verification_submissions WHERE status='pending'),
    'daily_reward_claims_today', (SELECT count(*) FROM daily_login_claims WHERE claimed_date=v_today_text),
    'daily_recharges_today', (
      (SELECT count(*) FROM recharge_transactions WHERE created_at>=v_today)
      + (SELECT count(*) FROM helper_orders WHERE created_at>=v_today AND status='completed')
      + (SELECT count(*) FROM coin_transfers WHERE created_at>=v_today AND status='completed')
    )
  ) INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_user_task_progress_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_claimed, false) = true
     AND COALESCE(NEW.is_completed, false) = false THEN
    RAISE EXCEPTION 'Cannot claim reward for an incomplete task';
  END IF;

  IF COALESCE(NEW.is_claimed, false) = true AND NEW.claimed_at IS NULL THEN
    NEW.claimed_at := now();
  END IF;

  IF COALESCE(NEW.is_claimed, false) = false THEN
    NEW.claimed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_task_reward(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _today text;
  _progress RECORD;
  _task RECORD;
  _is_host boolean;
  _new_host_level integer;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  _today := to_char((now() AT TIME ZONE 'UTC' - interval '30 minutes')::date, 'YYYY-MM-DD');

  -- Get task
  SELECT *
  INTO _task
  FROM public.daily_tasks
  WHERE id = _task_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not found');
  END IF;

  -- Lock and get progress
  SELECT *
  INTO _progress
  FROM public.user_task_progress
  WHERE user_id = _user_id
    AND task_id = _task_id
    AND reset_date = _today
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No progress found');
  END IF;

  IF NOT COALESCE(_progress.is_completed, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Task not completed');
  END IF;

  -- Claim (only if not already claimed)
  UPDATE public.user_task_progress
  SET
    is_claimed = true,
    claimed_at = now(),
    updated_at = now()
  WHERE id = _progress.id
    AND COALESCE(is_claimed, false) = false
  RETURNING * INTO _progress;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;

  -- Add beans to profile
  IF COALESCE(_task.reward_beans, 0) > 0 THEN
    UPDATE public.profiles
    SET beans = COALESCE(beans, 0) + _task.reward_beans
    WHERE id = _user_id;

    -- Update weekly earnings for hosts
    SELECT is_host INTO _is_host FROM public.profiles WHERE id = _user_id;
    IF _is_host = true THEN
      UPDATE public.profiles
      SET weekly_earnings = COALESCE(weekly_earnings, 0) + _task.reward_beans
      WHERE id = _user_id;
    END IF;
  END IF;

  -- Add coins/diamonds
  IF COALESCE(_task.reward_coins, 0) > 0 THEN
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + _task.reward_coins
    WHERE id = _user_id;
  END IF;

  -- Recalculate host level
  SELECT is_host INTO _is_host FROM public.profiles WHERE id = _user_id;
  IF _is_host = true THEN
    SELECT COALESCE(MAX(t.level_number), 0)
    INTO _new_host_level
    FROM public.user_level_tiers t
    WHERE t.tier_type = 'host'
      AND t.is_active = true
      AND t.min_earning_amount <= (
        SELECT COALESCE(weekly_earnings, 0) FROM public.profiles WHERE id = _user_id
      );

    UPDATE public.profiles
    SET host_level = _new_host_level
    WHERE id = _user_id
      AND COALESCE(host_level, 0) <> _new_host_level;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'beans', COALESCE(_task.reward_beans, 0),
    'coins', COALESCE(_task.reward_coins, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_processed_count integer := 0;
  v_total_host_earnings numeric := 0;
  v_total_commission numeric := 0;
  v_agency_record RECORD;
  v_host_record RECORD;
  v_period_start timestamp with time zone;
  v_period_end timestamp with time zone;
  v_correct_commission_rate numeric;
  v_host_gift_earnings numeric;
  v_host_call_earnings numeric;
  v_host_total numeric;
  v_commission_amount numeric;
  v_net_amount numeric;
  v_transfer_count integer := 0;
BEGIN
  v_period_end := now();
  v_period_start := now() - interval '7 days';

  FOR v_agency_record IN
    SELECT a.id as agency_id, a.name as agency_name, a.level as agency_level, a.commission_rate as current_rate
    FROM agencies a
    WHERE a.is_active = true AND a.is_blocked IS NOT TRUE
  LOOP
    -- Get correct commission rate from tier
    SELECT COALESCE(alt.commission_rate, 3)
    INTO v_correct_commission_rate
    FROM agency_level_tiers alt
    WHERE alt.level_code = COALESCE(v_agency_record.agency_level, 'A1')
      AND alt.is_active = true
    LIMIT 1;

    -- Update commission rate if different
    UPDATE agencies
    SET commission_rate = COALESCE(v_correct_commission_rate, 3),
        updated_at = now()
    WHERE id = v_agency_record.agency_id
      AND commission_rate IS DISTINCT FROM COALESCE(v_correct_commission_rate, 3);

    -- Process each host in the agency
    FOR v_host_record IN
      SELECT ah.host_id, p.display_name as host_name, p.uid as host_uid
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = v_agency_record.agency_id
        AND ah.status = 'active'
    LOOP
      -- Calculate gift earnings for this host in this period
      SELECT COALESCE(SUM(original_amount), 0)
      INTO v_host_gift_earnings
      FROM agency_commission_history
      WHERE agency_id = v_agency_record.agency_id
        AND host_id = v_host_record.host_id
        AND transaction_type = 'gift'
        AND created_at >= v_period_start
        AND created_at < v_period_end;

      -- Calculate call earnings
      SELECT COALESCE(SUM(original_amount), 0)
      INTO v_host_call_earnings
      FROM agency_commission_history
      WHERE agency_id = v_agency_record.agency_id
        AND host_id = v_host_record.host_id
        AND transaction_type = 'call'
        AND created_at >= v_period_start
        AND created_at < v_period_end;

      v_host_total := v_host_gift_earnings + v_host_call_earnings;

      -- Only create transfer if there are earnings
      IF v_host_total > 0 THEN
        v_commission_amount := ROUND(v_host_total * COALESCE(v_correct_commission_rate, 3) / 100, 2);
        v_net_amount := v_host_total - v_commission_amount;

        -- Create transfer record
        INSERT INTO agency_earnings_transfers (
          agency_id, host_id, amount, commission_rate,
          gift_earnings, call_earnings, 
          agency_name, host_name, host_uid,
          period_start, period_end, 
          status, transfer_type, processed_at
        ) VALUES (
          v_agency_record.agency_id, v_host_record.host_id, v_net_amount, v_correct_commission_rate,
          v_host_gift_earnings, v_host_call_earnings,
          v_agency_record.agency_name, v_host_record.host_name, v_host_record.host_uid,
          v_period_start, v_period_end,
          'completed', 'weekly_auto', now()
        );

        -- Add commission to agency diamond balance
        UPDATE agencies
        SET diamond_balance = diamond_balance + v_commission_amount,
            updated_at = now()
        WHERE id = v_agency_record.agency_id;

        v_total_host_earnings := v_total_host_earnings + v_net_amount;
        v_total_commission := v_total_commission + v_commission_amount;
        v_transfer_count := v_transfer_count + 1;
      END IF;
    END LOOP;

    v_processed_count := v_processed_count + 1;
  END LOOP;

  v_result := jsonb_build_object(
    'success', true,
    'processed_agencies', v_processed_count,
    'total_transfers', v_transfer_count,
    'total_host_earnings', v_total_host_earnings,
    'total_commission', v_total_commission,
    'period_start', v_period_start,
    'period_end', v_period_end
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(_agency_id uuid, _amount numeric, _payment_method text, _payment_details jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _beans_balance NUMERIC;
  _calculated_balance NUMERIC;
  _total_withdrawn NUMERIC;
  _effective_balance NUMERIC;
  _withdrawal_id UUID;
  _country_code TEXT;
  _currency_code TEXT;
  _local_amount NUMERIC;
  _owner_id UUID;
BEGIN
  -- CRITICAL: Verify caller is the agency owner
  SELECT owner_id INTO _owner_id FROM agencies WHERE id = _agency_id;
  IF auth.uid() IS NULL OR auth.uid() != _owner_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: Only agency owner can request withdrawal');
  END IF;

  SELECT COALESCE(beans_balance, 0) INTO _beans_balance
  FROM agencies WHERE id = _agency_id;
  
  IF _beans_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agency not found');
  END IF;
  
  SELECT COALESCE(SUM(COALESCE(gift_earnings, 0) + COALESCE(amount, 0)), 0)
  INTO _calculated_balance
  FROM agency_earnings_transfers
  WHERE agency_id = _agency_id;
  
  SELECT COALESCE(SUM(amount), 0)
  INTO _total_withdrawn
  FROM agency_withdrawals
  WHERE agency_id = _agency_id
    AND status IN ('pending', 'processing', 'approved', 'completed');
  
  _effective_balance := GREATEST(_calculated_balance - _total_withdrawn, 0);
  
  IF _effective_balance < _amount THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient balance',
      'available_balance', _effective_balance,
      'requested_amount', _amount,
      'total_earnings', _calculated_balance,
      'total_withdrawn', _total_withdrawn
    );
  END IF;
  
  _country_code := _payment_details->>'country_code';
  _currency_code := _payment_details->>'currency_code';
  _local_amount := COALESCE((_payment_details->>'local_amount')::NUMERIC, 0);
  
  INSERT INTO agency_withdrawals (
    agency_id, amount, status, payment_method, payment_details,
    country_code, currency_code, local_currency_amount
  ) VALUES (
    _agency_id, _amount, 'pending', _payment_method, _payment_details,
    _country_code, _currency_code, _local_amount
  )
  RETURNING id INTO _withdrawal_id;
  
  UPDATE agencies 
  SET beans_balance = beans_balance - _amount, updated_at = NOW()
  WHERE id = _agency_id;
  
  RETURN json_build_object(
    'success', true, 
    'withdrawal_id', _withdrawal_id,
    'amount', _amount,
    'effective_balance', _effective_balance,
    'new_available_balance', _effective_balance - _amount,
    'local_amount', _local_amount,
    'currency_code', _currency_code,
    'country_code', _country_code
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_remove_host_from_agency(
  _host_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_id UUID;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Get the host's current agency
  SELECT agency_id INTO _agency_id
  FROM agency_hosts
  WHERE host_id = _host_id AND status = 'active';
  
  IF _agency_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Update agency_hosts status
  UPDATE agency_hosts
  SET status = 'removed', left_at = now()
  WHERE host_id = _host_id AND agency_id = _agency_id;
  
  -- Remove agency_id from profile
  UPDATE profiles
  SET agency_id = NULL
  WHERE id = _host_id;
  
  -- Decrement agency host count
  UPDATE agencies
  SET total_hosts = GREATEST(total_hosts - 1, 0)
  WHERE id = _agency_id;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'remove_host_from_agency',
    'host',
    _host_id,
    jsonb_build_object('agency_id', _agency_id, 'reason', _reason)
  );
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_agency_coins(
  _agency_id UUID,
  _amount NUMERIC,
  _note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Add coins to agency wallet
  UPDATE agencies
  SET wallet_balance = COALESCE(wallet_balance, 0) + _amount
  WHERE id = _agency_id;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'add_agency_coins',
    'agency',
    _agency_id,
    jsonb_build_object('amount', _amount, 'note', _note)
  );
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_agency_level(
  _agency_id UUID,
  _level TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Update agency level
  UPDATE agencies
  SET level = _level
  WHERE id = _agency_id;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'update_agency_level',
    'agency',
    _agency_id,
    jsonb_build_object('new_level', _level)
  );
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  _withdrawal_id UUID,
  _status TEXT,
  _notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  _withdrawal RECORD;
  _helper_id UUID;
  _diamond_reward NUMERIC;
  _platform_fee NUMERIC;
  _net_reward NUMERIC;
  _helper_user_id UUID;
  _usd_amount NUMERIC;
  _net_beans NUMERIC;
BEGIN
  -- Get current withdrawal with computed net_withdrawal_beans
  SELECT 
    aw.*,
    COALESCE(
      (aw.payment_details->>'net_withdrawal_beans')::NUMERIC,
      aw.amount - COALESCE(aw.platform_fee_amount, 0)
    ) AS net_withdrawal_beans
  INTO _withdrawal 
  FROM agency_withdrawals aw
  WHERE aw.id = _withdrawal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _withdrawal.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition');
  END IF;

  -- If approving, update the status
  IF _status = 'approved' THEN
    -- Get the net beans amount from payment_details or calculate it
    _net_beans := COALESCE(
      (_withdrawal.payment_details->>'net_withdrawal_beans')::NUMERIC,
      _withdrawal.amount - COALESCE(
        (_withdrawal.payment_details->>'platform_fee')::NUMERIC,
        ROUND(_withdrawal.amount * 0.05, 0)
      )
    );

    UPDATE agency_withdrawals
    SET 
      status = _status,
      notes = _notes,
      processed_at = NOW(),
      payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object(
        'approved_at', NOW(),
        'net_withdrawal_beans', _net_beans
      )
    WHERE id = _withdrawal_id;
    
    -- If this was processed by a helper, credit their wallet
    IF _withdrawal.assigned_helper_id IS NOT NULL THEN
      -- Diamond reward equals the beans amount (1 bean = 1 diamond for helpers)
      _diamond_reward := _net_beans;
      
      IF _diamond_reward > 0 THEN
        -- Calculate 10% platform fee
        _platform_fee := ROUND(_diamond_reward * 0.10, 2);
        _net_reward := _diamond_reward - _platform_fee;
        
        -- Get helper's user_id from topup_helpers
        SELECT user_id INTO _helper_user_id 
        FROM topup_helpers 
        WHERE id = _withdrawal.assigned_helper_id;
        
        IF _helper_user_id IS NOT NULL THEN
          -- Update the withdrawal record with reward info
          UPDATE agency_withdrawals
          SET 
            diamond_reward = _diamond_reward,
            platform_fee_amount = _platform_fee,
            helper_net_reward = _net_reward
          WHERE id = _withdrawal_id;
          
          -- Credit the helper's wallet balance
          UPDATE topup_helpers
          SET wallet_balance = COALESCE(wallet_balance, 0) + _net_reward
          WHERE id = _withdrawal.assigned_helper_id;
          
          -- Create notification for helper (in English)
          INSERT INTO notifications (user_id, type, title, message, data)
          VALUES (
            _helper_user_id,
            'withdrawal_reward',
            '💎 Diamond Reward Received!',
            'You received ' || ROUND(_net_reward)::TEXT || ' diamonds for processing withdrawal (10% platform fee deducted)',
            jsonb_build_object(
              'withdrawal_id', _withdrawal_id,
              'gross_reward', _diamond_reward,
              'platform_fee', _platform_fee,
              'net_reward', _net_reward,
              'agency_id', _withdrawal.agency_id
            )
          );
        END IF;
      END IF;
    END IF;
    
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Withdrawal approved',
      'notes', _notes,
      'helper_id', _withdrawal.assigned_helper_id,
      'diamond_reward', _diamond_reward,
      'platform_fee', _platform_fee,
      'net_reward', _net_reward
    );
  ELSE
    -- Rejecting
    UPDATE agency_withdrawals
    SET 
      status = _status,
      notes = _notes,
      processed_at = NOW()
    WHERE id = _withdrawal_id;
    
    -- If rejected, return beans to agency
    IF _status = 'rejected' THEN
      UPDATE agencies
      SET beans_balance = COALESCE(beans_balance, 0) + _withdrawal.amount
      WHERE id = _withdrawal.agency_id;
    END IF;
    
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal ' || _status);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.generate_app_uid()
RETURNS VARCHAR(12)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_uid VARCHAR(12);
  uid_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate UID: 10 random digits (e.g., 1234567890)
    new_uid := lpad(floor(random() * 10000000000)::bigint::text, 10, '0');
    
    -- Check if UID already exists
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE app_uid = new_uid) INTO uid_exists;
    
    -- Exit loop if UID is unique
    EXIT WHEN NOT uid_exists;
  END LOOP;
  
  RETURN new_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_app_uid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.app_uid IS NULL THEN
    NEW.app_uid := public.generate_app_uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_user_by_app_uid(_app_uid TEXT)
RETURNS TABLE(
  id UUID,
  display_name TEXT,
  avatar_url TEXT,
  username TEXT,
  is_host BOOLEAN,
  app_uid TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.display_name::TEXT,
    p.avatar_url::TEXT,
    p.username::TEXT,
    p.is_host,
    p.app_uid::TEXT
  FROM profiles p
  WHERE p.app_uid = _app_uid
  OR p.app_uid LIKE _app_uid || '%';
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_sub_agent_referral_code()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  LOOP
    new_code := 'SA' || upper(substr(md5(random()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM profiles WHERE referral_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- place_live_game_bet
DROP FUNCTION IF EXISTS public.place_live_game_bet(uuid, uuid, integer, text, text);
CREATE FUNCTION public.place_live_game_bet(p_round_id uuid, p_user_id uuid, p_bet_amount integer, p_bet_type text DEFAULT NULL, p_bet_value text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_round RECORD;

CREATE OR REPLACE FUNCTION public.create_sub_agent(_agency_id uuid, _user_id uuid, _referrer_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referral_code TEXT;
  _sub_agent_id UUID;
BEGIN
  -- Verify caller is agency owner or admin
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_admin(auth.uid()) AND NOT EXISTS (
      SELECT 1 FROM agencies WHERE id = _agency_id AND owner_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Unauthorized: Only agency owner or admin can create sub-agents';
    END IF;
  END IF;

  _referral_code := public.generate_sub_agent_referral_code();
  WHILE EXISTS (SELECT 1 FROM sub_agents WHERE referral_code = _referral_code) LOOP
    _referral_code := public.generate_sub_agent_referral_code();
  END LOOP;
  INSERT INTO sub_agents (agency_id, user_id, referrer_id, referral_code)
  VALUES (_agency_id, _user_id, _referrer_id, _referral_code)
  RETURNING id INTO _sub_agent_id;
  RETURN _sub_agent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_level()
RETURNS TRIGGER AS $$
DECLARE
  weekly_income NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
BEGIN
  -- Calculate weekly income for the agency
  SELECT COALESCE(SUM(total_income), 0) INTO weekly_income
  FROM public.agency_performance
  WHERE agency_id = NEW.id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now());

  -- Get appropriate level based on income
  SELECT level_code, commission_rate 
  INTO new_level_code, new_commission_rate
  FROM public.agency_level_tiers
  WHERE weekly_income >= min_weekly_income 
    AND weekly_income <= max_weekly_income
    AND is_active = true
  ORDER BY min_weekly_income DESC
  LIMIT 1;

  -- Update agency level and commission if changed
  IF new_level_code IS NOT NULL AND (NEW.level IS NULL OR NEW.level != new_level_code) THEN
    NEW.level := new_level_code;
    NEW.commission_rate := new_commission_rate;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.recalculate_all_agency_levels()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_record RECORD;
  updated_count INTEGER := 0;
  weekly_income_beans NUMERIC;
  prev_week_income_beans NUMERIC;
  final_income_beans NUMERIC;
  final_income_usd NUMERIC;
  beans_to_usd_rate NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
BEGIN
  -- Get beans to USD rate
  SELECT COALESCE((setting_value->>'rate')::NUMERIC, 9000) INTO beans_to_usd_rate
  FROM app_settings
  WHERE setting_key = 'beans_to_usd_rate';
  
  IF beans_to_usd_rate IS NULL OR beans_to_usd_rate = 0 THEN
    beans_to_usd_rate := 9000;
  END IF;

  FOR agency_record IN SELECT id FROM agencies WHERE is_active = true LOOP
    -- Get current week income
    SELECT COALESCE(SUM(total_income), 0) INTO weekly_income_beans
    FROM agency_performance
    WHERE agency_id = agency_record.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now());

    -- Get previous week income
    SELECT COALESCE(SUM(total_income), 0) INTO prev_week_income_beans
    FROM agency_performance
    WHERE agency_id = agency_record.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now()) - interval '7 days'
      AND period_start < date_trunc('week', now());

    -- Use higher of current or previous week
    final_income_beans := GREATEST(weekly_income_beans, prev_week_income_beans);
    final_income_usd := final_income_beans / beans_to_usd_rate;

    -- Get appropriate level
    SELECT level_code, commission_rate 
    INTO new_level_code, new_commission_rate
    FROM agency_level_tiers
    WHERE final_income_usd >= min_weekly_income 
      AND final_income_usd <= max_weekly_income
      AND is_active = true
    ORDER BY min_weekly_income DESC
    LIMIT 1;

    -- If income exceeds all tiers, use highest tier
    IF new_level_code IS NULL AND final_income_usd > 0 THEN
      SELECT level_code, commission_rate 
      INTO new_level_code, new_commission_rate
      FROM agency_level_tiers
      WHERE is_active = true
      ORDER BY max_weekly_income DESC
      LIMIT 1;
    END IF;

    -- Default to A1
    IF new_level_code IS NULL THEN
      new_level_code := 'A1';
      new_commission_rate := 3;
    END IF;

    -- Update if different
    UPDATE agencies
    SET level = new_level_code, commission_rate = new_commission_rate, updated_at = now()
    WHERE id = agency_record.id
      AND (level IS NULL OR level != new_level_code);
    
    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_auto_ban_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  threshold INTEGER;
  current_count INTEGER;
BEGIN
  -- Get threshold from settings
  SELECT (setting_value::TEXT)::INTEGER INTO threshold
  FROM app_settings
  WHERE setting_key = 'auto_ban_phone_threshold';
  
  IF threshold IS NULL THEN
    threshold := 3;
  END IF;
  
  -- Get current violation count
  SELECT phone_violation_count INTO current_count
  FROM profiles
  WHERE id = NEW.user_id;
  
  -- Update violation count
  UPDATE profiles
  SET phone_violation_count = COALESCE(phone_violation_count, 0) + 1
  WHERE id = NEW.user_id;
  
  -- Check if should auto-ban
  IF (COALESCE(current_count, 0) + 1) >= threshold THEN
    -- Ban the user
    UPDATE profiles
    SET 
      is_blocked = true,
      blocked_at = now(),
      blocked_reason = 'Auto-banned for sharing phone numbers ' || (current_count + 1) || ' times',
      coins = 0,
      pending_earnings = 0
    WHERE id = NEW.user_id;
    
    -- Update the log to show ban action
    UPDATE chat_moderation_logs
    SET action_taken = 'auto_ban'
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_user_ban()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If user is being blocked
  IF NEW.is_blocked = true AND (OLD.is_blocked IS NULL OR OLD.is_blocked = false) THEN
    -- Set coins and earnings to 0
    NEW.coins := 0;
    NEW.pending_earnings := 0;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_login_reward()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '5s'
AS $function$
DECLARE
  v_user_id UUID;
  v_today_date DATE;
  v_today_text TEXT;
  v_streak RECORD;
  v_current_streak INT;
  v_next_day INT;
  v_reward RECORD;
  v_already_claimed BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_today_date := CURRENT_DATE;
  v_today_text := to_char(v_today_date, 'YYYY-MM-DD');

  SELECT EXISTS(
    SELECT 1 FROM daily_login_claims 
    WHERE user_id = v_user_id AND claimed_date = v_today_text
  ) INTO v_already_claimed;

  IF v_already_claimed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today');
  END IF;

  SELECT * INTO v_streak FROM user_login_streaks WHERE user_id = v_user_id;
  v_current_streak := COALESCE(v_streak.current_streak, 0);

  IF v_streak.last_login_date IS NOT NULL THEN
    IF v_today_date - v_streak.last_login_date::date > 1 THEN
      v_current_streak := 0;
    END IF;
  END IF;

  v_next_day := (v_current_streak % 7) + 1;

  SELECT * INTO v_reward FROM daily_login_rewards_config 
  WHERE day_number = v_next_day AND is_active = true;

  IF v_reward IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No reward config for day ' || v_next_day);
  END IF;

  INSERT INTO daily_login_claims (user_id, day_number, reward_coins, reward_diamonds, claimed_date)
  VALUES (v_user_id, v_next_day, v_reward.reward_coins, v_reward.reward_diamonds, v_today_text);

  IF v_reward.reward_coins > 0 THEN
    UPDATE profiles 
    SET coins = COALESCE(coins, 0) + v_reward.reward_coins 
    WHERE id = v_user_id;
  END IF;

  IF v_streak.id IS NOT NULL THEN
    UPDATE user_login_streaks SET
      current_streak = CASE WHEN v_current_streak + 1 > 7 THEN 1 ELSE v_current_streak + 1 END,
      last_login_date = v_today_text,
      total_logins = COALESCE(total_logins, 0) + 1,
      updated_at = now()
    WHERE user_id = v_user_id;
  ELSE
    INSERT INTO user_login_streaks (user_id, current_streak, last_login_date, total_logins)
    VALUES (v_user_id, 1, v_today_text, 1);
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'day', v_next_day,
    'coins', v_reward.reward_coins,
    'diamonds', v_reward.reward_diamonds,
    'new_streak', v_current_streak + 1
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_unique_app_uid()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_uid TEXT;
  uid_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate random 8-digit number (10000000 to 99999999)
    new_uid := LPAD(FLOOR(RANDOM() * 90000000 + 10000000)::TEXT, 8, '0');
    
    -- Check if it already exists
    SELECT EXISTS(SELECT 1 FROM profiles WHERE app_uid = new_uid) INTO uid_exists;
    
    -- Exit loop if unique
    IF NOT uid_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  RETURN new_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_app_uid_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only set if app_uid is null or empty
  IF NEW.app_uid IS NULL OR NEW.app_uid = '' THEN
    NEW.app_uid := public.generate_unique_app_uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id uuid,
  _action text,
  _approve_as text DEFAULT 'user',
  _set_gender text DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _submission RECORD;
  _gender_value text;
  _notif_title text;
  _notif_message text;
  _notif_type text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  SELECT * INTO _submission
  FROM face_verification_submissions
  WHERE id = _submission_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  _gender_value := COALESCE(_set_gender, CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  
  IF _action = 'approve' THEN
    UPDATE face_verification_submissions
    SET 
      status = 'approved',
      verification_type = _approve_as,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = _reason,
      updated_at = now()
    WHERE id = _submission_id;
    
    IF _approve_as = 'host' THEN
      UPDATE profiles
      SET 
        is_verified = true,
        is_face_verified = true,
        face_verification_image = _submission.face_image_url,
        face_verified_at = now(),
        is_host = true,
        host_status = 'approved',
        gender = _gender_value
      WHERE id = _submission.user_id;
    ELSE
      UPDATE profiles
      SET 
        is_verified = true,
        is_face_verified = true,
        face_verification_image = _submission.face_image_url,
        face_verified_at = now(),
        is_host = false,
        host_status = NULL,
        gender = _gender_value
      WHERE id = _submission.user_id;
    END IF;
    
    _notif_title := '✅ Face Verification Approved!';
    _notif_message := 'Congratulations! Your face verification has been approved as ' || 
      CASE WHEN _approve_as = 'host' THEN '🎤 Host' ELSE '👤 Verified User' END || '.';
    _notif_type := 'face_verification_approved';
    
    INSERT INTO notifications (user_id, title, message, type, data)
    VALUES (
      _submission.user_id,
      _notif_title,
      _notif_message,
      _notif_type,
      jsonb_build_object(
        'submission_id', _submission_id,
        'approved_as', _approve_as,
        'gender', _gender_value
      )
    );
    
  ELSIF _action = 'reject' THEN
    UPDATE face_verification_submissions
    SET 
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = _reason,
      updated_at = now()
    WHERE id = _submission_id;
    
    UPDATE profiles
    SET 
      is_face_verified = false,
      face_verification_image = NULL,
      face_verified_at = NULL
    WHERE id = _submission.user_id;
    
    _notif_title := '❌ Face Verification Rejected';
    _notif_message := CASE 
      WHEN _reason IS NOT NULL AND _reason != '' THEN 
        'Your face verification was rejected. Reason: ' || _reason || '. Please try again.'
      ELSE 
        'Your face verification was rejected. Please try again with a clear photo/video.'
    END;
    _notif_type := 'face_verification_rejected';
    
    INSERT INTO notifications (user_id, title, message, type, data)
    VALUES (
      _submission.user_id,
      _notif_title,
      _notif_message,
      _notif_type,
      jsonb_build_object(
        'submission_id', _submission_id,
        'rejection_reason', COALESCE(_reason, ''),
        'verification_type', _submission.verification_type
      )
    );
  END IF;
  
  PERFORM public.log_admin_action(
    'process_face_verification',
    'face_verification',
    _submission_id,
    jsonb_build_object(
      'action', _action,
      'approve_as', _approve_as,
      'gender', _gender_value,
      'user_id', _submission.user_id,
      'verification_type', _submission.verification_type,
      'reason', _reason
    )
  );
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_as_topup_helper(_contact_info JSONB DEFAULT '{}')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_id UUID;
BEGIN
  -- Check if already applied
  SELECT id INTO _helper_id FROM topup_helpers WHERE user_id = auth.uid();
  
  IF _helper_id IS NOT NULL THEN
    RETURN _helper_id;
  END IF;
  
  -- Create new application
  INSERT INTO topup_helpers (user_id, contact_info)
  VALUES (auth.uid(), _contact_info)
  RETURNING id INTO _helper_id;
  
  RETURN _helper_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.helper_buy_coins(_amount INTEGER, _payment_method TEXT, _payment_details JSONB DEFAULT '{}')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper RECORD;
  _transaction_id UUID;
  _usd_amount NUMERIC;
  _settings JSONB;
  _buy_rate NUMERIC;
BEGIN
  -- Get helper info
  SELECT * INTO _helper FROM topup_helpers WHERE user_id = auth.uid() AND is_active = true AND is_verified = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized as helper';
  END IF;
  
  -- Get platform buy rate from settings
  SELECT setting_value INTO _settings FROM app_settings WHERE setting_key = 'coin_trader_settings';
  _buy_rate := COALESCE((_settings->>'platform_buy_rate')::NUMERIC, 0.95);
  
  -- Calculate USD amount (rate is per 100 coins)
  _usd_amount := (_amount / 100.0) * _buy_rate;
  
  -- Create transaction
  INSERT INTO helper_transactions (
    helper_id, transaction_type, coin_amount, usd_amount, payment_method, payment_details, status
  ) VALUES (
    _helper.id, 'buy_from_platform', _amount, _usd_amount, _payment_method, _payment_details, 'pending'
  ) RETURNING id INTO _transaction_id;
  
  RETURN _transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_helper(_helper_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  UPDATE topup_helpers
  SET is_verified = true, is_active = true, approved_at = now(), approved_by = auth.uid()
  WHERE id = _helper_id;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_helper_transaction(_transaction_id UUID, _action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _txn RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  SELECT * INTO _txn FROM helper_transactions WHERE id = _transaction_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  IF _action = 'approve' AND _txn.transaction_type = 'buy_from_platform' THEN
    -- Update transaction
    UPDATE helper_transactions
    SET status = 'completed', processed_at = now(), processed_by = auth.uid()
    WHERE id = _transaction_id;
    
    -- Add coins to helper wallet
    UPDATE topup_helpers
    SET wallet_balance = wallet_balance + _txn.coin_amount,
        total_bought = total_bought + _txn.coin_amount
    WHERE id = _txn.helper_id;
    
  ELSIF _action = 'reject' THEN
    UPDATE helper_transactions
    SET status = 'failed', processed_at = now(), processed_by = auth.uid()
    WHERE id = _transaction_id;
  END IF;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.helper_process_order(_order_id UUID, _action TEXT, _notes TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order RECORD;
  _helper_user_id UUID;
BEGIN
  -- Get order and verify helper
  SELECT ho.*, th.user_id as helper_user_id 
  INTO _order
  FROM helper_orders ho
  JOIN topup_helpers th ON ho.helper_id = th.id
  WHERE ho.id = _order_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Verify caller is the helper or admin
  IF _order.helper_user_id != auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  IF _action = 'complete' THEN
    -- Mark order as completed
    UPDATE helper_orders
    SET status = 'completed', processed_at = now(), helper_notes = _notes
    WHERE id = _order_id;
    
    -- Add coins to user
    UPDATE profiles
    SET coins = COALESCE(coins, 0) + _order.coin_amount
    WHERE id = _order.user_id;
    
    -- Update helper stats
    UPDATE topup_helpers
    SET total_sold = COALESCE(total_sold, 0) + _order.coin_amount,
        total_earnings = COALESCE(total_earnings, 0) + _order.amount_usd
    WHERE id = _order.helper_id;
    
  ELSIF _action = 'reject' THEN
    UPDATE helper_orders
    SET status = 'cancelled', processed_at = now(), helper_notes = _notes
    WHERE id = _order_id;
  END IF;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_available_helper(user_country TEXT DEFAULT 'BD')
RETURNS TABLE(
  helper_id UUID,
  user_id UUID,
  wallet_balance NUMERIC,
  country_code TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    th.id as helper_id,
    th.user_id,
    th.wallet_balance,
    th.country_code
  FROM topup_helpers th
  WHERE th.is_active = true 
    AND th.is_verified = true
    AND th.wallet_balance > 0
    AND (th.country_code = user_country OR user_country = ANY(th.supported_countries))
  ORDER BY 
    CASE WHEN th.country_code = user_country THEN 0 ELSE 1 END,
    th.wallet_balance DESC
  LIMIT 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.helper_transfer_coins(
  _user_app_uid TEXT,
  _coin_amount INT,
  _notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_id UUID;
  _helper_wallet NUMERIC;
  _target_user_id UUID;
  _sender_face_verified BOOLEAN;
  _result JSON;
BEGIN
  -- Check if sender has completed face verification
  SELECT is_face_verified INTO _sender_face_verified
  FROM public.profiles
  WHERE id = auth.uid();
  
  IF _sender_face_verified IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Face verification required to transfer beans. Please complete face verification first.');
  END IF;
  
  -- Get helper info
  SELECT th.id, th.wallet_balance INTO _helper_id, _helper_wallet
  FROM topup_helpers th
  WHERE th.user_id = auth.uid() AND th.is_active = true AND th.is_verified = true;
  
  IF _helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Helper not found or not verified');
  END IF;
  
  -- Check wallet balance
  IF _helper_wallet < _coin_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;
  
  -- Find target user by app_uid
  SELECT id INTO _target_user_id FROM profiles WHERE app_uid = _user_app_uid;
  
  IF _target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found with this ID');
  END IF;
  
  -- Deduct from helper wallet
  UPDATE topup_helpers 
  SET wallet_balance = wallet_balance - _coin_amount,
      total_sold = COALESCE(total_sold, 0) + _coin_amount
  WHERE id = _helper_id;
  
  -- Add to user coins
  UPDATE profiles 
  SET coins = COALESCE(coins, 0) + _coin_amount 
  WHERE id = _target_user_id;
  
  -- Record transaction
  INSERT INTO helper_transactions (
    helper_id, user_id, transaction_type, coin_amount, status, notes
  ) VALUES (
    _helper_id, _target_user_id, 'transfer_to_user', _coin_amount, 'completed', _notes
  );
  
  RETURN json_build_object('success', true, 'message', 'Transfer completed successfully');
END;
$$;

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
  
  -- Get package info
  SELECT * INTO _package FROM coin_packages WHERE id = _package_id;
  
  IF _package IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid package');
  END IF;
  
  -- Find best available helper for user's country
  SELECT th.id INTO _helper_id
  FROM topup_helpers th
  WHERE th.is_active = true 
    AND th.is_verified = true
    AND th.wallet_balance >= _package.coins
    AND (th.country_code = _country_code OR _country_code = ANY(th.supported_countries))
  ORDER BY 
    CASE WHEN th.country_code = _country_code THEN 0 ELSE 1 END,
    th.display_order ASC,
    th.wallet_balance DESC
  LIMIT 1;
  
  IF _helper_id IS NULL THEN
    -- Fallback: find any helper with sufficient balance
    SELECT th.id INTO _helper_id
    FROM topup_helpers th
    WHERE th.is_active = true AND th.is_verified = true AND th.wallet_balance >= _package.coins
    ORDER BY th.wallet_balance DESC
    LIMIT 1;
  END IF;
  
  IF _helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No helper available at the moment');
  END IF;
  
  -- Create order
  INSERT INTO helper_orders (
    helper_id, user_id, package_id, coin_amount, 
    amount_usd, amount_local, currency_code, 
    payment_method, user_country_code, user_payment_proof, status
  ) VALUES (
    _helper_id, _user_id, _package_id, _package.coins,
    _amount_usd, _amount_local, _currency_code,
    _payment_method, _country_code, _payment_proof, 'pending'
  )
  RETURNING id INTO _order_id;
  
  RETURN json_build_object(
    'success', true,
    'order_id', _order_id,
    'helper_id', _helper_id,
    'message', 'Order created successfully'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_user_coins(
  _user_id UUID,
  _amount INTEGER,
  _note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_profile RECORD;
  _new_balance INTEGER;
  _new_consumption BIGINT;
  _new_level INTEGER;
  _is_female_host BOOLEAN;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Get user profile
  SELECT * INTO _user_profile FROM profiles WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Check if user is female host
  _is_female_host := (_user_profile.is_host = true AND _user_profile.gender = 'female');
  
  -- Calculate new consumption (only for non-host users, this represents top-up amount)
  _new_consumption := COALESCE(_user_profile.total_consumption, 0) + _amount;
  
  -- Calculate new level based on consumption (for regular users) or earnings (for female hosts)
  IF _is_female_host THEN
    -- Female hosts level is based on earnings, not consumption - don't change level from topup
    _new_level := COALESCE(_user_profile.user_level, 0);
  ELSE
    -- Regular users: Level based on total_consumption (top-up amount)
    _new_level := CASE
      WHEN _new_consumption >= 30000000000 THEN 50
      WHEN _new_consumption >= 10000000000 THEN 40
      WHEN _new_consumption >= 3000000000 THEN 30
      WHEN _new_consumption >= 1000000000 THEN 20
      WHEN _new_consumption >= 300000000 THEN 10
      WHEN _new_consumption >= 100000000 THEN 9
      WHEN _new_consumption >= 30000000 THEN 8
      WHEN _new_consumption >= 10000000 THEN 7
      WHEN _new_consumption >= 3000000 THEN 6
      WHEN _new_consumption >= 1000000 THEN 5
      WHEN _new_consumption >= 300000 THEN 4
      WHEN _new_consumption >= 100000 THEN 3
      WHEN _new_consumption >= 30000 THEN 2
      WHEN _new_consumption >= 10000 THEN 1
      ELSE 0
    END;
  END IF;
  
  -- Update user coins, total_consumption, and user_level
  UPDATE profiles 
  SET 
    coins = COALESCE(coins, 0) + _amount,
    total_consumption = _new_consumption,
    user_level = _new_level
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'add_user_coins',
    'user',
    _user_id,
    jsonb_build_object(
      'amount', _amount,
      'note', _note,
      'previous_balance', COALESCE(_user_profile.coins, 0),
      'new_balance', _new_balance,
      'new_consumption', _new_consumption,
      'new_level', _new_level
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'user_id', _user_id,
    'amount_added', _amount,
    'new_balance', _new_balance,
    'new_consumption', _new_consumption,
    'new_level', _new_level
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_host_earnings_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_is_host BOOLEAN;
  _host_agency_id UUID;
  _period_start DATE;
  _host_earnings NUMERIC;
BEGIN
  SELECT is_host, agency_id INTO _host_is_host, _host_agency_id FROM public.profiles WHERE id = NEW.receiver_id;

  IF _host_is_host = true AND _host_agency_id IS NOT NULL THEN
    _host_earnings := FLOOR(NEW.coin_amount * public.get_effective_host_percent() / 100);
    _period_start := date_trunc('week', CURRENT_DATE)::date;
    INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
    VALUES (_host_agency_id, 'weekly', _period_start, _host_earnings, _host_earnings)
    ON CONFLICT (agency_id, period_type, period_start) DO UPDATE SET
      total_income = agency_performance.total_income + _host_earnings,
      golden_host_income = agency_performance.golden_host_income + _host_earnings,
      updated_at = now();
  END IF;

  -- Non-hosts get full coins back (gift acts as coin transfer)
  IF _host_is_host IS NOT TRUE THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + NEW.coin_amount WHERE id = NEW.receiver_id;
  END IF;

  RETURN NEW;
END;
$$;
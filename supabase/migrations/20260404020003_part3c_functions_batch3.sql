CREATE OR REPLACE FUNCTION public.check_expired_items_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if any equipped items have expired for this user
  PERFORM restore_expired_items();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_frame_references(frame_id_to_clear uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can clear frame references';
  END IF;

  UPDATE profiles SET frame_id = NULL WHERE frame_id = frame_id_to_clear;
  UPDATE profiles SET equipped_frame_id = NULL WHERE equipped_frame_id = frame_id_to_clear;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_withdrawal_helper()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_id UUID;
  _country_code TEXT;
BEGIN
  -- Get the country code from the new withdrawal
  _country_code := NEW.country_code;
  
  -- If no country code, try to get from payment_details
  IF _country_code IS NULL THEN
    _country_code := NEW.payment_details->>'country_code';
  END IF;
  
  -- Skip if no country code
  IF _country_code IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Find an available helper for this country with payroll enabled
  -- Priority: 
  -- 1. Helper's country_code matches
  -- 2. Helper's supported_countries includes the user's country
  -- 3. Helper has payroll_enabled = true
  -- 4. Helper wallet_balance >= 300000 (3 Lakh minimum)
  -- 5. Order by wallet_balance DESC to assign to most capable helper
  SELECT id INTO _helper_id
  FROM topup_helpers
  WHERE is_active = TRUE
    AND is_verified = TRUE
    AND payroll_enabled = TRUE
    AND wallet_balance >= 300000
    AND (
      country_code = _country_code
      OR _country_code = ANY(supported_countries)
    )
  ORDER BY 
    CASE WHEN country_code = _country_code THEN 0 ELSE 1 END, -- Prioritize exact country match
    wallet_balance DESC -- Higher balance = more reliable
  LIMIT 1;
  
  -- Assign the helper if found
  IF _helper_id IS NOT NULL THEN
    NEW.assigned_helper_id := _helper_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agency_sub_agents_count(agency_uuid UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM agencies WHERE parent_agency_id = agency_uuid AND is_active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_agency_total_network(agency_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  direct_hosts INTEGER;
  sub_agencies INTEGER;
  sub_agency_hosts INTEGER;
BEGIN
  -- Direct hosts count
  SELECT COUNT(*)::integer INTO direct_hosts 
  FROM agency_hosts 
  WHERE agency_id = agency_uuid AND status = 'active';
  
  -- Sub-agencies count
  SELECT COUNT(*)::integer INTO sub_agencies 
  FROM agencies 
  WHERE parent_agency_id = agency_uuid AND is_active = true;
  
  -- Hosts under sub-agencies
  SELECT COALESCE(SUM(ah_count), 0)::integer INTO sub_agency_hosts
  FROM (
    SELECT COUNT(*) as ah_count 
    FROM agency_hosts ah
    JOIN agencies a ON ah.agency_id = a.id
    WHERE a.parent_agency_id = agency_uuid AND ah.status = 'active'
  ) counts;
  
  result := json_build_object(
    'direct_hosts', direct_hosts,
    'sub_agencies', sub_agencies,
    'sub_agency_hosts', sub_agency_hosts,
    'total_network', direct_hosts + sub_agency_hosts
  );
  
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_agency_agents(agency_uuid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE agencies 
  SET total_agents = COALESCE(total_agents, 0) + 1, updated_at = NOW()
  WHERE id = agency_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_action text,
  p_resource_type text DEFAULT NULL,
  p_resource_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL,
  p_severity text DEFAULT 'info'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.security_audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    details,
    severity
  ) VALUES (
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_details,
    p_severity
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_live_game_round(p_game_id text, p_room_id uuid DEFAULT NULL::uuid, p_betting_seconds integer DEFAULT 30)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_round_id uuid;
BEGIN
  -- CRITICAL: Only admins or system can create game rounds
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only system can create game rounds';
  END IF;

  INSERT INTO public.live_game_rounds (
    game_id, room_id, status, betting_ends_at
  ) VALUES (
    p_game_id, p_room_id, 'betting', now() + (p_betting_seconds || ' seconds')::interval
  )
  RETURNING id INTO v_round_id;
  
  RETURN v_round_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify(
    'new_message',
    json_build_object(
      'id', NEW.id,
      'conversation_id', NEW.conversation_id,
      'sender_id', NEW.sender_id
    )::text
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_user_permission(
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = 'admin'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_level(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(user_level, 1)
  FROM public.profiles
  WHERE id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.get_user_beans(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(beans, 0)
  FROM public.profiles
  WHERE id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.get_user_coins(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(coins, 0)
  FROM public.profiles
  WHERE id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.increment_view_count(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table = 'reels' THEN
    UPDATE public.reels SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_id;
  ELSIF p_table = 'live_streams' THEN
    UPDATE public.live_streams SET viewer_count = COALESCE(viewer_count, 0) + 1 WHERE id = p_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_commission(
  p_amount numeric,
  p_rate numeric DEFAULT 0.1
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(p_amount * p_rate, 2)
$$;

CREATE OR REPLACE FUNCTION public.transfer_beans(p_from_user uuid, p_to_user uuid, p_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_balance integer;
BEGIN
  -- CRITICAL: Only the sender can transfer their own beans
  IF auth.uid() IS NULL OR auth.uid() != p_from_user THEN
    RAISE EXCEPTION 'Unauthorized: You can only transfer your own beans';
  END IF;

  SELECT beans INTO v_from_balance
  FROM public.profiles
  WHERE id = p_from_user
  FOR UPDATE;
  
  IF v_from_balance IS NULL OR v_from_balance < p_amount THEN
    RETURN false;
  END IF;
  
  UPDATE public.profiles SET beans = beans - p_amount WHERE id = p_from_user;
  UPDATE public.profiles SET beans = COALESCE(beans, 0) + p_amount WHERE id = p_to_user;
  
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_coins(
  p_from_user UUID,
  p_to_user UUID,
  p_amount INTEGER
) RETURNS jsonb AS $$
DECLARE
  sender_balance INTEGER;
  receiver_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Lock rows in consistent order to prevent deadlocks
  IF p_from_user < p_to_user THEN
    PERFORM id FROM profiles WHERE id = p_from_user FOR UPDATE;
    PERFORM id FROM profiles WHERE id = p_to_user FOR UPDATE;
  ELSE
    PERFORM id FROM profiles WHERE id = p_to_user FOR UPDATE;
    PERFORM id FROM profiles WHERE id = p_from_user FOR UPDATE;
  END IF;

  -- Deduct from sender
  UPDATE profiles
  SET coins = coins - p_amount
  WHERE id = p_from_user AND coins >= p_amount
  RETURNING coins INTO sender_balance;

  IF sender_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Add to receiver
  UPDATE profiles
  SET coins = coins + p_amount
  WHERE id = p_to_user
  RETURNING coins INTO receiver_balance;

  IF receiver_balance IS NULL THEN
    -- Rollback will happen automatically
    RAISE EXCEPTION 'Receiver not found';
  END IF;

  RETURN jsonb_build_object('success', true, 'sender_balance', sender_balance, 'receiver_balance', receiver_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_access_party_room(p_user_id uuid, p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.party_rooms 
    WHERE id = p_room_id 
      AND (is_private = false OR host_id = p_user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_agency(p_user_id uuid, p_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agencies WHERE id = p_agency_id AND owner_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.agency_hosts WHERE agency_id = p_agency_id AND host_id = p_user_id AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_stream_owner(p_user_id uuid, p_stream_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.live_streams
    WHERE id = p_stream_id AND host_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';
  DELETE FROM public.failed_login_attempts WHERE last_attempt_at < now() - interval '24 hours';
  DELETE FROM public.blocked_ips WHERE expires_at < now() AND is_permanent = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_input(p_input text, p_type text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_input IS NULL OR p_input = '' THEN RETURN false; END IF;
  
  CASE p_type
    WHEN 'email' THEN RETURN p_input ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\\\.[a-zA-Z]{2,}$';
    WHEN 'username' THEN RETURN p_input ~ '^[a-zA-Z0-9_]{3,30}$';
    WHEN 'phone' THEN RETURN p_input ~ '^\\\\+?[0-9]{10,15}$';
    WHEN 'uuid' THEN RETURN p_input ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    ELSE RETURN true;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT,
  p_max_requests INT DEFAULT 60,
  p_window_seconds INT DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_window_start TIMESTAMPTZ;
  v_allowed BOOLEAN;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;
  
  -- Count recent attempts
  SELECT COUNT(*) INTO v_count
  FROM public.rate_limit_attempts
  WHERE identifier = p_identifier
    AND action_type = p_action_type
    AND attempted_at >= v_window_start;
  
  v_allowed := v_count < p_max_requests;
  
  -- Log this attempt
  INSERT INTO public.rate_limit_attempts (identifier, action_type)
  VALUES (p_identifier, p_action_type);
  
  -- Periodic cleanup (1% chance per call)
  IF random() < 0.01 THEN
    PERFORM public.cleanup_rate_limits();
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current_count', v_count + 1,
    'max_requests', p_max_requests,
    'window_seconds', p_window_seconds,
    'retry_after', CASE WHEN NOT v_allowed THEN p_window_seconds ELSE 0 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_ip_blocked(p_ip inet)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_ips
    WHERE ip_address = p_ip AND (is_permanent = true OR expires_at > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_suspicious_activity(
  p_user_id uuid,
  p_activity_type text,
  p_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_security_event('suspicious_activity', p_activity_type, p_user_id::text, p_details, 'error');
  
  IF p_activity_type = 'phone_sharing' THEN
    UPDATE public.profiles SET phone_violation_count = COALESCE(phone_violation_count, 0) + 1 WHERE id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sanitize_input(p_input text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN regexp_replace(
    regexp_replace(p_input, E'[;\\\\'\\\\\\"\\\\\\\\/\\\\\\\\\\\\\\\\]', '', 'g'),
    E'--', '', 'g'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_session()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_blocked = true
  ) THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_group_membership(p_user_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE user_id = p_user_id
      AND group_id = p_group_id
  )
$$;

CREATE OR REPLACE FUNCTION public.process_gift_transaction(
  p_sender_id uuid, p_receiver_id uuid, p_gift_id uuid, p_quantity integer,
  p_stream_id uuid DEFAULT NULL, p_party_room_id uuid DEFAULT NULL, p_call_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gift RECORD;
  v_sender RECORD;
  v_total_coins BIGINT;
  v_host_percent INT;
  v_beans_earned BIGINT;
  v_transaction_id UUID;
  v_receiver_is_host BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: You can only send gifts from your own account');
  END IF;
  IF COALESCE(p_quantity, 0) <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity'); END IF;

  SELECT id, name, coin_value, icon_url, animation_url INTO v_gift FROM gifts WHERE id = p_gift_id AND is_active = true;
  IF v_gift IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Gift not found or inactive'); END IF;

  v_total_coins := v_gift.coin_value::BIGINT * p_quantity::BIGINT;
  SELECT id, coins INTO v_sender FROM profiles WHERE id = p_sender_id FOR UPDATE;
  IF v_sender IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Sender not found'); END IF;
  IF v_sender.coins < v_total_coins THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins', 'required', v_total_coins, 'available', v_sender.coins); END IF;

  SELECT COALESCE(is_host, false) INTO v_receiver_is_host FROM profiles WHERE id = p_receiver_id;
  v_host_percent := public.get_effective_host_percent();
  v_beans_earned := FLOOR((v_total_coins::NUMERIC * v_host_percent) / 100)::BIGINT;

  -- Deduct from sender
  UPDATE profiles SET coins = coins - v_total_coins, total_consumption = COALESCE(total_consumption, 0) + v_total_coins, updated_at = now() WHERE id = p_sender_id;

  -- HOSTS get beans; NON-HOSTS get coins via update_host_earnings_on_gift trigger
  IF v_receiver_is_host THEN
    UPDATE profiles SET beans = COALESCE(beans, 0) + v_beans_earned, pending_earnings = COALESCE(pending_earnings, 0) + v_beans_earned, total_earnings = COALESCE(total_earnings, 0) + v_beans_earned, updated_at = now() WHERE id = p_receiver_id;
  END IF;

  INSERT INTO gift_transactions (gift_id, sender_id, receiver_id, coin_amount, quantity, stream_id, party_room_id, call_id, created_at)
  VALUES (p_gift_id, p_sender_id, p_receiver_id, v_total_coins, p_quantity, p_stream_id, p_party_room_id, p_call_id, now())
  RETURNING id INTO v_transaction_id;

  IF p_stream_id IS NOT NULL THEN
    UPDATE live_streams SET total_gifts = COALESCE(total_gifts, 0) + 1, total_coins_earned = COALESCE(total_coins_earned, 0) + v_total_coins WHERE id = p_stream_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'transaction_id', v_transaction_id, 'coins_spent', v_total_coins, 'beans_earned', v_beans_earned, 'host_percent', v_host_percent, 'is_host', v_receiver_is_host, 'gift_name', v_gift.name, 'gift_icon_url', v_gift.icon_url, 'gift_animation_url', v_gift.animation_url);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_level_from_performance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  weekly_income_beans NUMERIC;
  prev_week_income_beans NUMERIC;
  final_income_beans NUMERIC;
  final_income_usd NUMERIC;
  beans_to_usd_rate NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
  current_agency RECORD;
BEGIN
  -- Get beans to USD rate from app_settings (default 9000 beans = $1)
  SELECT COALESCE((setting_value->>'rate')::NUMERIC, 9000) INTO beans_to_usd_rate
  FROM app_settings
  WHERE setting_key = 'beans_to_usd_rate';
  
  IF beans_to_usd_rate IS NULL OR beans_to_usd_rate = 0 THEN
    beans_to_usd_rate := 9000;
  END IF;

  -- Get current week income (in beans)
  SELECT COALESCE(SUM(total_income), 0) INTO weekly_income_beans
  FROM public.agency_performance
  WHERE agency_id = NEW.agency_id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now());

  -- Get previous week income (in case current week just started)
  SELECT COALESCE(SUM(total_income), 0) INTO prev_week_income_beans
  FROM public.agency_performance
  WHERE agency_id = NEW.agency_id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now()) - interval '7 days'
    AND period_start < date_trunc('week', now());

  -- Use higher of current or previous week (in beans)
  final_income_beans := GREATEST(weekly_income_beans, prev_week_income_beans);
  
  -- Convert beans to USD for level comparison
  final_income_usd := final_income_beans / beans_to_usd_rate;

  -- Get current agency details
  SELECT level, commission_rate INTO current_agency
  FROM public.agencies
  WHERE id = NEW.agency_id;

  -- Get appropriate level based on USD income
  SELECT level_code, commission_rate 
  INTO new_level_code, new_commission_rate
  FROM public.agency_level_tiers
  WHERE final_income_usd >= min_weekly_income 
    AND final_income_usd <= max_weekly_income
    AND is_active = true
  ORDER BY min_weekly_income DESC
  LIMIT 1;

  -- If income exceeds all tiers, use highest tier (A5 Legend)
  IF new_level_code IS NULL AND final_income_usd > 0 THEN
    SELECT level_code, commission_rate 
    INTO new_level_code, new_commission_rate
    FROM public.agency_level_tiers
    WHERE is_active = true
    ORDER BY max_weekly_income DESC
    LIMIT 1;
  END IF;

  -- Default to A1 if nothing found
  IF new_level_code IS NULL THEN
    SELECT level_code, commission_rate 
    INTO new_level_code, new_commission_rate
    FROM public.agency_level_tiers
    WHERE level_code = 'A1' AND is_active = true
    LIMIT 1;
  END IF;

  -- Update agency level and commission if changed
  IF new_level_code IS NOT NULL AND (current_agency.level IS NULL OR current_agency.level != new_level_code) THEN
    UPDATE public.agencies 
    SET level = new_level_code, commission_rate = new_commission_rate, updated_at = now()
    WHERE id = NEW.agency_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_owner(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = _user_id 
        AND role = 'owner'
        AND is_active = true
    )
$$;

CREATE OR REPLACE FUNCTION public.has_section_access(_user_id UUID, _section_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        -- Owner has access to everything
        public.is_admin_owner(_user_id)
        OR
        -- Sub-admin has specific section access
        EXISTS (
            SELECT 1 
            FROM public.admin_users au
            JOIN public.admin_section_permissions asp ON asp.admin_user_id = au.id
            JOIN public.admin_sections s ON s.id = asp.section_id
            WHERE au.user_id = _user_id 
            AND au.is_active = true
            AND s.section_key = _section_key
            AND s.is_active = true
            AND asp.can_view = true
        )
$$;

CREATE OR REPLACE FUNCTION public.get_admin_role(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role::TEXT FROM public.admin_users
    WHERE user_id = _user_id AND is_active = true
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_accessible_sections(_user_id UUID)
RETURNS TABLE(section_key TEXT, section_name TEXT, hub_key TEXT, can_edit BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If owner, return all sections
    IF public.is_admin_owner(_user_id) THEN
        RETURN QUERY
        SELECT s.section_key, s.section_name, s.hub_key, true as can_edit
        FROM public.admin_sections s
        WHERE s.is_active = true
        ORDER BY s.display_order;
    ELSE
        -- Return only permitted sections
        RETURN QUERY
        SELECT s.section_key, s.section_name, s.hub_key, asp.can_edit
        FROM public.admin_users au
        JOIN public.admin_section_permissions asp ON asp.admin_user_id = au.id
        JOIN public.admin_sections s ON s.id = asp.section_id
        WHERE au.user_id = _user_id 
        AND au.is_active = true
        AND s.is_active = true
        AND asp.can_view = true
        ORDER BY s.display_order;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_users_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_admin_device_approved(
  _user_id UUID,
  _device_fingerprint TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_user admin_users;
  _device_exists BOOLEAN;
BEGIN
  -- Get admin user
  SELECT * INTO _admin_user FROM admin_users WHERE user_id = _user_id LIMIT 1;
  
  -- If not an admin user, deny
  IF _admin_user.id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Owners have unlimited device access
  IF _admin_user.role = 'owner' THEN
    RETURN TRUE;
  END IF;
  
  -- Check if this device is approved for this admin
  SELECT EXISTS (
    SELECT 1 FROM admin_allowed_devices
    WHERE admin_user_id = _admin_user.id
      AND device_fingerprint = _device_fingerprint
      AND status = 'approved'
  ) INTO _device_exists;
  
  RETURN _device_exists;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_admin_device(
  _device_fingerprint TEXT,
  _device_name TEXT DEFAULT NULL,
  _device_info JSONB DEFAULT '{}',
  _ip_address TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_user admin_users;
  _device_id UUID;
  _existing_device admin_allowed_devices;
BEGIN
  -- Get admin user
  SELECT * INTO _admin_user FROM admin_users WHERE user_id = auth.uid() LIMIT 1;
  
  IF _admin_user.id IS NULL THEN
    RAISE EXCEPTION 'Not an admin user';
  END IF;
  
  -- Check if device already exists
  SELECT * INTO _existing_device 
  FROM admin_allowed_devices 
  WHERE admin_user_id = _admin_user.id AND device_fingerprint = _device_fingerprint;
  
  IF _existing_device.id IS NOT NULL THEN
    -- Update last used
    UPDATE admin_allowed_devices 
    SET last_used_at = now(),
        ip_address = COALESCE(_ip_address, ip_address),
        user_agent = COALESCE(_user_agent, user_agent)
    WHERE id = _existing_device.id;
    
    RETURN _existing_device.id;
  END IF;
  
  -- For owners, auto-approve devices
  IF _admin_user.role = 'owner' THEN
    INSERT INTO admin_allowed_devices (
      admin_user_id, device_fingerprint, device_name, device_info,
      ip_address, user_agent, status, approved_by, approved_at
    ) VALUES (
      _admin_user.id, _device_fingerprint, _device_name, _device_info,
      _ip_address, _user_agent, 'approved', _admin_user.id, now()
    ) RETURNING id INTO _device_id;
  ELSE
    -- For sub-admins, device starts as pending
    INSERT INTO admin_allowed_devices (
      admin_user_id, device_fingerprint, device_name, device_info,
      ip_address, user_agent, status
    ) VALUES (
      _admin_user.id, _device_fingerprint, _device_name, _device_info,
      _ip_address, _user_agent, 'pending'
    ) RETURNING id INTO _device_id;
  END IF;
  
  RETURN _device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_device_status(
  _device_id UUID,
  _new_status admin_device_status,
  _notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_user admin_users;
BEGIN
  -- Check if caller is owner
  SELECT * INTO _admin_user FROM admin_users 
  WHERE user_id = auth.uid() AND role = 'owner' LIMIT 1;
  
  IF _admin_user.id IS NULL THEN
    RAISE EXCEPTION 'Only owners can manage device access';
  END IF;
  
  -- Update device status
  UPDATE admin_allowed_devices
  SET status = _new_status,
      approved_by = CASE WHEN _new_status = 'approved' THEN _admin_user.id ELSE approved_by END,
      approved_at = CASE WHEN _new_status = 'approved' THEN now() ELSE approved_at END,
      notes = COALESCE(_notes, notes)
  WHERE id = _device_id;
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_first_minute_earnings(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call_record record;
  _settings jsonb;
  _host_commission_percent integer;
  _grace_period_seconds integer;
  _first_minute_beans integer;
  _actual_duration_seconds integer;
BEGIN
  -- Get call record
  SELECT * INTO _call_record
  FROM private_calls
  WHERE id = p_call_id;
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  
  -- Get settings
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  -- Get commission percent
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN
    _host_commission_percent := 0;
  ELSE
    _host_commission_percent := (_settings->>'host_commission_percent')::integer;
  END IF;
  
  -- Get grace period
  IF _settings IS NULL OR (_settings->>'first_minute_grace_seconds') IS NULL THEN
    _grace_period_seconds := 21;
  ELSE
    _grace_period_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  END IF;
  
  -- Calculate actual duration (from start to end)
  _actual_duration_seconds := GREATEST(
    EXTRACT(EPOCH FROM (COALESCE(_call_record.ended_at, now()) - _call_record.started_at))::integer,
    0
  );
  
  -- If call lasted less than grace period, host gets nothing (already 0)
  IF _actual_duration_seconds < _grace_period_seconds THEN
    RETURN jsonb_build_object(
      'success', true, 'beans_earned', 0,
      'reason', 'call_too_short',
      'duration_seconds', _actual_duration_seconds,
      'grace_period', _grace_period_seconds
    );
  END IF;
  
  -- Calculate first minute beans (commission % of coins_per_minute)
  _first_minute_beans := FLOOR(COALESCE(_call_record.coins_per_minute, 0) * _host_commission_percent / 100);
  
  IF _first_minute_beans > 0 THEN
    -- Credit beans to host
    UPDATE profiles
    SET pending_earnings = COALESCE(pending_earnings, 0) + _first_minute_beans,
        total_earnings = COALESCE(total_earnings, 0) + _first_minute_beans,
        -- CRITICAL FIX: Also add to weekly_earnings so host level increases
        weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_beans
    WHERE id = _call_record.host_id;
    
    -- Update call record
    UPDATE private_calls
    SET host_earnings_amount = COALESCE(host_earnings_amount, 0) + _first_minute_beans
    WHERE id = p_call_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 'beans_earned', _first_minute_beans,
    'duration_seconds', _actual_duration_seconds,
    'commission_percent', _host_commission_percent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_reel_gift()
RETURNS TRIGGER AS $$
DECLARE
  host_share DECIMAL(5,2) := 0.55; -- 55% commission (from app_settings)
  beans_amount BIGINT;
BEGIN
  -- Only process if this is a reel gift
  IF NEW.reel_id IS NOT NULL THEN
    -- Calculate beans (55% of coin_amount)
    beans_amount := FLOOR(NEW.coin_amount * host_share);
    
    -- Update reel beans_earned
    UPDATE public.reels 
    SET beans_earned = beans_earned + beans_amount
    WHERE id = NEW.reel_id;
    
    -- Also add to receiver's beans balance
    UPDATE public.profiles 
    SET beans_balance = beans_balance + beans_amount
    WHERE id = NEW.receiver_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.process_contact_violation(
    p_host_id UUID,
    p_detected_content TEXT,
    p_detected_pattern TEXT,
    p_source_type TEXT,
    p_source_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_violation_count INTEGER;
    v_new_violation_number INTEGER;
    v_penalty RECORD;
    v_beans_deducted INTEGER := 0;
    v_is_banned BOOLEAN := false;
    v_result JSONB;
    v_latest_violation_id UUID;
    v_safe_source_id UUID := NULL;
    v_current_earnings NUMERIC;
BEGIN
    IF p_source_id IS NOT NULL AND p_source_id != '' THEN
        BEGIN
            v_safe_source_id := p_source_id::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_safe_source_id := NULL;
        END;
    END IF;

    SELECT COUNT(*) INTO v_violation_count
    FROM public.host_contact_violations
    WHERE host_id = p_host_id;
    
    v_new_violation_number := v_violation_count + 1;
    
    SELECT * INTO v_penalty
    FROM public.violation_penalty_tiers
    WHERE violation_number = LEAST(v_new_violation_number, 6)
    AND is_active = true;
    
    IF v_penalty IS NULL THEN
        SELECT * INTO v_penalty
        FROM public.violation_penalty_tiers
        WHERE violation_number = 6
        AND is_active = true;
    END IF;
    
    SELECT COALESCE(weekly_earnings, 0) INTO v_current_earnings
    FROM public.profiles
    WHERE id = p_host_id;
    
    IF v_penalty IS NOT NULL AND v_penalty.penalty_type = 'account_ban' THEN
        UPDATE public.profiles
        SET 
            is_blocked = true,
            blocked_reason = 'Auto-banned: 6+ contact sharing violations',
            blocked_at = now()
        WHERE id = p_host_id;
        
        v_is_banned := true;
        v_beans_deducted := 0;
    ELSIF v_penalty IS NOT NULL THEN
        v_beans_deducted := v_penalty.beans_amount;
        
        -- ALLOW NEGATIVE: Deduct even if balance is 0, creating a negative balance
        -- The negative balance will be recovered when host earns more
        UPDATE public.profiles
        SET 
            weekly_earnings = COALESCE(weekly_earnings, 0) - v_beans_deducted,
            beans = COALESCE(beans, 0) - v_beans_deducted
        WHERE id = p_host_id;
    ELSE
        v_beans_deducted := 2000;
        UPDATE public.profiles
        SET 
            weekly_earnings = COALESCE(weekly_earnings, 0) - v_beans_deducted,
            beans = COALESCE(beans, 0) - v_beans_deducted
        WHERE id = p_host_id;
    END IF;
    
    INSERT INTO public.host_contact_violations (
        host_id, violation_number, violation_type, detected_content,
        detected_pattern, source_type, source_id, beans_deducted, is_auto_detected
    ) VALUES (
        p_host_id, v_new_violation_number, 'contact_sharing', p_detected_content,
        p_detected_pattern, p_source_type, p_source_id, v_beans_deducted, true
    )
    RETURNING id INTO v_latest_violation_id;

    INSERT INTO public.chat_moderation_logs (
        user_id, violation_type, detected_content, conversation_id,
        action_taken, is_auto_action, notes
    ) VALUES (
        p_host_id, p_detected_pattern, p_detected_content, v_safe_source_id,
        CASE WHEN v_is_banned THEN 'account_banned'
            ELSE 'beans_deducted_' || v_beans_deducted::TEXT
        END,
        true,
        'Violation #' || v_new_violation_number || ' | -' || v_beans_deducted || ' beans (was ' || v_current_earnings || ')'
    );
    
    v_result := jsonb_build_object(
        'success', true,
        'violation_id', v_latest_violation_id,
        'violation_number', v_new_violation_number,
        'beans_deducted', v_beans_deducted,
        'is_banned', v_is_banned
    );
    
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_violation(
    p_admin_id UUID,
    p_host_id UUID,
    p_detected_content TEXT,
    p_detected_pattern TEXT,
    p_source_type TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_result JSONB;
    v_violation_id UUID;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.admin_users 
        WHERE user_id = p_admin_id AND is_active = true
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    v_result := public.process_contact_violation(
        p_host_id,
        p_detected_content,
        p_detected_pattern,
        p_source_type,
        NULL
    );
    
    v_violation_id := (v_result->>'violation_id')::UUID;
    
    UPDATE public.host_contact_violations
    SET 
        is_auto_detected = false,
        is_reviewed = true,
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_notes = p_notes
    WHERE id = v_violation_id;
    
    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_total_recharged()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    UPDATE profiles 
    SET total_recharged = COALESCE(total_recharged, 0) + NEW.coins_received
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_user_level_comprehensive()
RETURNS TRIGGER AS $$
DECLARE
  target_user_id uuid;
  user_earnings bigint;
  user_recharged bigint;
  current_level int;
  new_level int := 0;
  is_female_host boolean;
BEGIN
  -- Determine the target user based on trigger source
  IF TG_TABLE_NAME = 'profiles' THEN
    target_user_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'gift_transaction_logs' THEN
    -- For gift logs, only update RECEIVER (host) level, NOT sender
    target_user_id := NEW.receiver_id;
  ELSIF TG_TABLE_NAME = 'recharge_transactions' THEN
    -- For recharge, update the user who recharged
    target_user_id := NEW.user_id;
  ELSE
    RETURN NEW;
  END IF;

  -- Skip if no user id
  IF target_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get user profile data
  SELECT 
    COALESCE(total_earnings, 0),
    COALESCE(total_recharged, 0),
    COALESCE(user_level, 0),
    (is_host = true AND gender = 'female')
  INTO user_earnings, user_recharged, current_level, is_female_host
  FROM profiles
  WHERE id = target_user_id;

  -- Find the appropriate level based on user type
  IF is_female_host THEN
    -- For female hosts: Level based on total earnings (gifts received)
    SELECT COALESCE(MAX(level_number), 0) INTO new_level
    FROM host_levels
    WHERE is_active = true
      AND beans_required <= user_earnings;
  ELSE
    -- For regular users (BOYS): Level ONLY based on DIAMOND RECHARGE
    -- NOT based on gifts sent!
    SELECT COALESCE(MAX(level_number), 0) INTO new_level
    FROM user_level_thresholds
    WHERE is_active = true
      AND diamonds_required <= user_recharged;
  END IF;

  -- Fallback if no level tables exist
  IF new_level IS NULL THEN
    IF is_female_host THEN
      new_level := CASE
        WHEN user_earnings >= 150000000 THEN 10
        WHEN user_earnings >= 50000000 THEN 9
        WHEN user_earnings >= 15000000 THEN 8
        WHEN user_earnings >= 5000000 THEN 7
        WHEN user_earnings >= 1500000 THEN 6
        WHEN user_earnings >= 500000 THEN 5
        WHEN user_earnings >= 150000 THEN 4
        WHEN user_earnings >= 50000 THEN 3
        WHEN user_earnings >= 15000 THEN 2
        WHEN user_earnings >= 5000 THEN 1
        ELSE 0
      END;
    ELSE
      -- User level from RECHARGE only
      new_level := CASE
        WHEN user_recharged >= 30000000000 THEN 50
        WHEN user_recharged >= 10000000000 THEN 40
        WHEN user_recharged >= 3000000000 THEN 30
        WHEN user_recharged >= 1000000000 THEN 20
        WHEN user_recharged >= 300000000 THEN 10
        WHEN user_recharged >= 100000000 THEN 9
        WHEN user_recharged >= 30000000 THEN 8
        WHEN user_recharged >= 10000000 THEN 7
        WHEN user_recharged >= 3000000 THEN 6
        WHEN user_recharged >= 1000000 THEN 5
        WHEN user_recharged >= 300000 THEN 4
        WHEN user_recharged >= 100000 THEN 3
        WHEN user_recharged >= 30000 THEN 2
        WHEN user_recharged >= 10000 THEN 1
        ELSE 0
      END;
    END IF;
  END IF;

  -- Only update if level changed
  IF new_level != current_level THEN
    UPDATE profiles 
    SET user_level = new_level,
        host_level = CASE WHEN is_female_host THEN new_level ELSE host_level END
    WHERE id = target_user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.recover_session_by_device(p_device_id text)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, gender text, is_host boolean, recovery_email character varying(255), recovery_password text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as user_id,
    p.display_name,
    p.avatar_url,
    p.gender,
    p.is_host,
    (SELECT au.email FROM auth.users au WHERE au.id = p.id) as recovery_email,
    ('meri_' || p_device_id || '_secure')::text as recovery_password
  FROM profiles p
  WHERE p.device_id = p_device_id
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_coins_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- CRITICAL: Only admins can add coins
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add coins';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  UPDATE profiles 
  SET coins = COALESCE(coins, 0) + _amount 
  WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Log the admin action
  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (auth.uid()::text, 'add_coins', _user_id::text, 'user', 
    jsonb_build_object('amount', _amount, 'action', 'admin_coin_add'));
END;
$$;

CREATE OR REPLACE FUNCTION public.add_diamonds_to_agency(_agency_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add agency diamonds';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  UPDATE agencies 
  SET diamond_balance = COALESCE(diamond_balance, 0) + _amount 
  WHERE id = _agency_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(
  _user_id uuid,
  _beans_amount integer,
  _diamonds_reward integer,
  _tier_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_beans INTEGER;
BEGIN
  -- CRITICAL: User can only exchange their own beans
  IF auth.uid() IS NULL OR auth.uid() != _user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Read beans from profiles (not gift_transactions)
  SELECT COALESCE(beans, 0) INTO current_beans
  FROM profiles WHERE id = _user_id FOR UPDATE;
  
  IF current_beans < _beans_amount THEN
    RAISE EXCEPTION 'Insufficient beans balance';
  END IF;
  
  -- Set bypass flag for protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  -- Deduct beans and add diamonds atomically
  UPDATE profiles 
  SET beans = COALESCE(beans, 0) - _beans_amount,
      coins = COALESCE(coins, 0) + _diamonds_reward
  WHERE id = _user_id;
  
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  
  -- Log the exchange
  INSERT INTO user_beans_exchange_history (user_id, beans_spent, diamonds_received, tier_id)
  VALUES (_user_id, _beans_amount, _diamonds_reward, _tier_id);
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_active_session(
  p_user_id UUID,
  p_session_id TEXT,
  p_device_info TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET 
    active_session_id = p_session_id,
    last_login_at = NOW(),
    last_login_device = COALESCE(p_device_info, last_login_device)
  WHERE id = p_user_id;
  
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_session_valid(
  p_user_id UUID,
  p_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_session TEXT;
BEGIN
  SELECT active_session_id INTO v_active_session
  FROM profiles
  WHERE id = p_user_id;
  
  -- If no active session set, consider valid
  IF v_active_session IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check if current session matches active session
  RETURN v_active_session = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_notices(p_user_id uuid)
 RETURNS SETOF admin_notices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_host BOOLEAN := FALSE;
  v_is_agency BOOLEAN := FALSE;
  v_is_helper BOOLEAN := FALSE;
  v_is_level5_helper BOOLEAN := FALSE;
  v_audiences TEXT[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
    AND is_host = true
  ) INTO v_is_host;

  SELECT EXISTS (
    SELECT 1 FROM agencies
    WHERE owner_id = p_user_id
    AND is_active = true
  ) INTO v_is_agency;

  SELECT EXISTS (
    SELECT 1 FROM topup_helpers
    WHERE user_id = p_user_id
    AND is_verified = true
  ) INTO v_is_helper;

  SELECT EXISTS (
    SELECT 1 FROM topup_helpers
    WHERE user_id = p_user_id
    AND is_verified = true
    AND trader_level = 5
  ) INTO v_is_level5_helper;

  v_audiences := ARRAY['all', 'users'];
  
  IF v_is_host THEN
    v_audiences := array_append(v_audiences, 'hosts');
  END IF;
  
  IF v_is_agency THEN
    v_audiences := array_append(v_audiences, 'agencies');
  END IF;
  
  IF v_is_helper THEN
    v_audiences := array_append(v_audiences, 'helpers');
  END IF;
  
  IF v_is_level5_helper THEN
    v_audiences := array_append(v_audiences, 'level5_helpers');
  END IF;

  RETURN QUERY
  SELECT an.*
  FROM admin_notices an
  WHERE an.is_active = true
    AND (an.expires_at IS NULL OR an.expires_at > now())
    AND an.target_audience && v_audiences
  ORDER BY 
    CASE an.priority 
      WHEN 'urgent' THEN 1 
      WHEN 'high' THEN 2 
      WHEN 'normal' THEN 3 
      ELSE 4 
    END,
    an.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add diamonds';
  END IF;
  UPDATE profiles
  SET diamonds = COALESCE(diamonds, 0) + _amount
  WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_beans_to_user(_user_id UUID, _amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add beans';
  END IF;
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + _amount
  WHERE id = _user_id;
END;
$$;

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
  v_currency_name TEXT;
BEGIN
  -- Calculate BST time (UTC+6)
  v_bst_now := (now() AT TIME ZONE 'Asia/Dhaka');
  
  -- If before 00:30 BST, we're still in \\"yesterday\\"
  IF v_bst_now::time < '00:30:00'::time THEN
    v_bst_today := (v_bst_now - interval '1 day')::date;
  ELSE
    v_bst_today := v_bst_now::date;
  END IF;

  IF p_period_type = 'daily' THEN
    -- Daily: previous day's 00:30 BST to today's 00:30 BST
    v_end_date := (v_bst_today::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := to_char(v_bst_today - interval '1 day', 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    -- Weekly: Monday 00:30 BST to next Monday 00:30 BST
    DECLARE v_dow INTEGER;
    BEGIN
      v_dow := EXTRACT(ISODOW FROM v_bst_today); -- 1=Mon
      v_end_date := ((v_bst_today - (v_dow - 1) * interval '1 day')::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
      v_start_date := v_end_date - interval '1 week';
      v_period_label := 'week-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD');
    END;
  ELSIF p_period_type = 'monthly' THEN
    -- Monthly: 1st 00:30 BST to next month 1st 00:30 BST
    v_end_date := (date_trunc('month', v_bst_today)::timestamp + interval '30 minutes') AT TIME ZONE 'Asia/Dhaka';
    v_start_date := v_end_date - interval '1 month';
    v_period_label := 'month-' || to_char((v_start_date AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM');
  ELSE
    RETURN 0;
  END IF;

  -- Idempotency check: use EXACT match on category + period_type + period_label
  SELECT EXISTS (
    SELECT 1 FROM leaderboard_reward_history
    WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label
    LIMIT 1
  ) INTO v_already;

  IF v_already THEN RETURN 0; END IF;

  -- ===== HOST EARNINGS (Hosts/Female → BEANS ONLY) =====
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
      AND user_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9','ab155d31-96d4-4a42-855d-b2c090ba0339','251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        
        -- ENFORCE: Host earnings = BEANS ONLY
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_diamonds, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            PERFORM _internal_add_beans(v_entry.user_id, v_reward_amount);
            
            INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, 0, 0, v_reward_amount, now());
            
            INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
              v_entry.user_id, 'reward',
              '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Host Rank #' || v_rank || '!',
              'Congratulations! You ranked #' || v_rank || ' in the ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Host Leaderboard and earned ' || v_reward_amount || ' Beans! 🎉',
              jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_beans', v_reward_amount), false);
            
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Host reward error user=% rank=%: %', v_entry.user_id, v_rank, SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ===== GAME WINNERS (Users/Male → DIAMONDS ONLY) =====
  IF p_category = 'game_winners' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gt.user_id, SUM(gt.amount) AS stat_value
      FROM game_transactions gt
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      AND gt.transaction_type = 'win' AND gt.amount > 0
      AND gt.user_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9','ab155d31-96d4-4a42-855d-b2c090ba0339','251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      GROUP BY gt.user_id
      ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        
        -- ENFORCE: Game winners = DIAMONDS ONLY
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_beans, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            PERFORM _internal_add_coins(v_entry.user_id, v_reward_amount);
            
            INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, v_reward_amount, 0, 0, now());
            
            INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
              v_entry.user_id, 'reward',
              '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Game Rank #' || v_rank || '!',
              'Congratulations! You ranked #' || v_rank || ' in the ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Game Leaderboard and earned ' || v_reward_amount || ' Diamonds! 💎',
              jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
            
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Game reward error user=% rank=%: %', v_entry.user_id, v_rank, SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ===== TOP GIFTERS (Users/Male → DIAMONDS ONLY) =====
  IF p_category = 'top_gifters' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT gt.sender_id AS user_id, SUM(gt.coin_amount) AS stat_value
      FROM gift_transactions gt
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      AND gt.sender_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9','ab155d31-96d4-4a42-855d-b2c090ba0339','251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      GROUP BY gt.sender_id
      ORDER BY stat_value DESC LIMIT 50
    ) LOOP
      v_rank := v_rank + 1;
      SELECT * INTO v_reward FROM leaderboard_reward_config
        WHERE category = p_category AND period_type = p_period_type AND is_active = true
        AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;
      IF v_reward IS NOT NULL THEN
        IF COALESCE(v_reward.min_target, 0) > 0 AND v_entry.stat_value < v_reward.min_target THEN CONTINUE; END IF;
        
        -- ENFORCE: Top gifters = DIAMONDS ONLY
        v_reward_amount := GREATEST(COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_coins, 0), COALESCE(v_reward.reward_beans, 0));
        IF v_reward_amount > 0 THEN
          BEGIN
            PERFORM _internal_add_coins(v_entry.user_id, v_reward_amount);
            
            INSERT INTO leaderboard_reward_history (user_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.user_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, v_reward_amount, 0, 0, now());
            
            INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
              v_entry.user_id, 'reward',
              '🏆 ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Gifter Rank #' || v_rank || '!',
              'Congratulations! You ranked #' || v_rank || ' in the ' || CASE p_period_type WHEN 'daily' THEN 'Daily' WHEN 'weekly' THEN 'Weekly' ELSE 'Monthly' END || ' Gifter Leaderboard and earned ' || v_reward_amount || ' Diamonds! 💎',
              jsonb_build_object('category', p_category, 'period_type', p_period_type, 'rank', v_rank, 'reward_diamonds', v_reward_amount), false);
            
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Gifter reward error user=% rank=%: %', v_entry.user_id, v_rank, SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ===== AGENCY PERFORMANCE (Agencies → BEANS ONLY) =====
  IF p_category = 'agency_performance' THEN
    v_rank := 0;
    FOR v_entry IN (
      SELECT ah.agency_id, SUM(FLOOR(gt.coin_amount * 0.6)) AS stat_value
      FROM gift_transactions gt
      INNER JOIN agency_hosts ah ON ah.host_id = gt.receiver_id AND ah.status = 'active'
      WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
      GROUP BY ah.agency_id
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
            UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + v_reward_amount WHERE id = v_entry.agency_id;
            
            INSERT INTO leaderboard_reward_history (agency_id, category, period_type, period_label, rank_position, stat_value, reward_coins, reward_diamonds, reward_beans, sent_at)
            VALUES (v_entry.agency_id, p_category, p_period_type, v_period_label, v_rank, v_entry.stat_value, 0, 0, v_reward_amount, now());
            
            v_count := v_count + 1;
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Agency reward error agency=% rank=%: %', v_entry.agency_id, v_rank, SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_distribute_leaderboard_rewards()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results TEXT := '';
  v_count INTEGER;
  v_categories TEXT[] := ARRAY['host_earnings', 'game_winners', 'agency_performance', 'top_gifters'];
  v_cat TEXT;
  v_bst_now TIMESTAMP := (now() AT TIME ZONE 'Asia/Dhaka');
  v_bst_dow INTEGER := EXTRACT(ISODOW FROM v_bst_now); -- 1=Mon
  v_bst_day INTEGER := EXTRACT(DAY FROM v_bst_now);
BEGIN
  FOREACH v_cat IN ARRAY v_categories LOOP
    -- Daily: always distribute (idempotent)
    SELECT distribute_period_rewards(v_cat, 'daily') INTO v_count;
    IF v_count > 0 THEN
      v_results := v_results || v_cat || '/daily: ' || v_count || ' winners. ';
    END IF;

    -- Weekly: on Monday (ISODOW=1) in BST
    IF v_bst_dow = 1 THEN
      SELECT distribute_period_rewards(v_cat, 'weekly') INTO v_count;
      IF v_count > 0 THEN
        v_results := v_results || v_cat || '/weekly: ' || v_count || ' winners. ';
      END IF;
    END IF;

    -- Monthly: on 1st in BST
    IF v_bst_day = 1 THEN
      SELECT distribute_period_rewards(v_cat, 'monthly') INTO v_count;
      IF v_count > 0 THEN
        v_results := v_results || v_cat || '/monthly: ' || v_count || ' winners. ';
      END IF;
    END IF;
  END LOOP;

  IF v_results = '' THEN
    v_results := 'No distributions needed (BST DOW: ' || v_bst_dow || ', Day: ' || v_bst_day || ')';
  END IF;

  RETURN v_results;
END;
$$;

CREATE OR REPLACE FUNCTION public.distribute_pk_rewards(p_competition_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp RECORD;
  v_count INTEGER := 0;
  v_participant RECORD;
  v_reward RECORD;
  v_rank INTEGER := 0;
  v_already BOOLEAN;
BEGIN
  -- Get competition
  SELECT * INTO v_comp FROM pk_competitions WHERE id = p_competition_id;
  IF v_comp IS NULL THEN RETURN 0; END IF;

  -- Check if already distributed
  SELECT EXISTS (
    SELECT 1 FROM pk_reward_history WHERE competition_id = p_competition_id LIMIT 1
  ) INTO v_already;
  IF v_already THEN RETURN 0; END IF;

  -- Loop through participants ordered by score
  FOR v_participant IN (
    SELECT * FROM pk_participants
    WHERE competition_id = p_competition_id AND score > 0
    ORDER BY score DESC
    LIMIT 50
  ) LOOP
    v_rank := v_rank + 1;

    -- Update rank position
    UPDATE pk_participants SET rank_position = v_rank WHERE id = v_participant.id;

    -- Find matching reward tier
    SELECT * INTO v_reward FROM pk_competition_rewards
    WHERE competition_id = p_competition_id AND is_active = true
    AND v_rank >= rank_from AND v_rank <= rank_to LIMIT 1;

    IF v_reward IS NOT NULL THEN
      -- Credit rewards
      IF v_reward.reward_beans > 0 THEN
        UPDATE profiles SET beans_balance = COALESCE(beans_balance, 0) + v_reward.reward_beans WHERE id = v_participant.user_id;
      END IF;
      IF v_reward.reward_diamonds > 0 THEN
        UPDATE profiles SET coins = coins + v_reward.reward_diamonds WHERE id = v_participant.user_id;
      END IF;
      IF v_reward.reward_coins > 0 THEN
        UPDATE profiles SET coins = coins + v_reward.reward_coins WHERE id = v_participant.user_id;
      END IF;

      -- Record history
      INSERT INTO pk_reward_history (competition_id, user_id, rank_position, reward_diamonds, reward_beans, reward_coins)
      VALUES (p_competition_id, v_participant.user_id, v_rank, COALESCE(v_reward.reward_diamonds, 0), COALESCE(v_reward.reward_beans, 0), COALESCE(v_reward.reward_coins, 0));

      -- Mark as distributed
      UPDATE pk_participants SET reward_distributed = true WHERE id = v_participant.id;

      -- Send notification
      INSERT INTO notifications (user_id, type, title, message, data, is_read) VALUES (
        v_participant.user_id, 'reward', '🏆 PK Competition Reward!',
        'Congratulations! You ranked #' || v_rank || ' in \\"' || v_comp.title || '\\"! Rewards: ' ||
        CASE WHEN COALESCE(v_reward.reward_diamonds, 0) > 0 THEN v_reward.reward_diamonds || ' Diamonds ' ELSE '' END ||
        CASE WHEN COALESCE(v_reward.reward_beans, 0) > 0 THEN v_reward.reward_beans || ' Beans ' ELSE '' END ||
        CASE WHEN COALESCE(v_reward.reward_coins, 0) > 0 THEN v_reward.reward_coins || ' Coins' ELSE '' END,
        jsonb_build_object('type', 'pk_reward', 'competition_id', p_competition_id, 'rank', v_rank,
          'reward_diamonds', COALESCE(v_reward.reward_diamonds, 0), 'reward_beans', COALESCE(v_reward.reward_beans, 0),
          'reward_coins', COALESCE(v_reward.reward_coins, 0)),
        false
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- Update competition status
  UPDATE pk_competitions SET status = 'ended' WHERE id = p_competition_id;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_distribute_pk_rewards()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp RECORD;
  v_total INTEGER := 0;
  v_result INTEGER;
BEGIN
  -- Find all active competitions that have ended
  FOR v_comp IN (
    SELECT id, title FROM pk_competitions
    WHERE status = 'active' AND end_date <= now()
  ) LOOP
    SELECT distribute_pk_rewards(v_comp.id) INTO v_result;
    v_total := v_total + COALESCE(v_result, 0);
  END LOOP;

  -- Also auto-activate upcoming competitions
  UPDATE pk_competitions SET status = 'active'
  WHERE status = 'upcoming' AND start_date <= now() AND end_date > now();

  RETURN 'PK: Distributed to ' || v_total || ' winners';
END;
$$;
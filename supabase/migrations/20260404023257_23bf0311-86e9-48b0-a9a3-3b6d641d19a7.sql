
-- Core helper functions that other functions depend on

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = _user_id AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = _user_id AND role::text = _role AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action_type text,
  _target_type text DEFAULT NULL,
  _target_id uuid DEFAULT NULL,
  _details jsonb DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid()::text, _action_type, _target_type, _target_id::text, _details);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_user_id UUID, _conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = _conversation_id
    AND (participant1_id = _user_id OR participant2_id = _user_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', 'New User'),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_app_uid()
RETURNS VARCHAR(12) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.app_uid IS NULL OR NEW.app_uid = '' THEN
    NEW.app_uid := public.generate_app_uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_guest_profile(_device_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _guest_uid varchar(12);
BEGIN
  _guest_uid := public.generate_app_uid();
  RETURN jsonb_build_object('guest_uid', _guest_uid, 'device_id', _device_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_effective_host_percent()
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _percent numeric;
BEGIN
  SELECT COALESCE(setting_value::numeric, 10)
  INTO _percent
  FROM app_settings
  WHERE setting_key = 'host_earning_percent';
  RETURN COALESCE(_percent, 10);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_user_level(_total_consumption bigint)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = public
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

CREATE OR REPLACE FUNCTION public.search_user_by_id(_search_id text)
RETURNS TABLE(id uuid, display_name text, avatar_url text, app_uid varchar, is_host boolean, is_online boolean, user_level integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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

CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public._internal_add_beans(_user_id uuid, _amount integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE profiles SET beans = COALESCE(beans, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._internal_add_coins(_user_id uuid, _amount integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF _amount <= 0 THEN RETURN; END IF;
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._internal_add_diamonds(_user_id uuid, _amount integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._internal_add_diamonds(_user_id uuid, _amount bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_beans_to_user(_user_id uuid, _amount integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add beans';
  END IF;
  UPDATE profiles SET beans = COALESCE(beans, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_coins(p_user_id uuid, p_amount integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
DECLARE
  result_balance INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  UPDATE profiles SET coins = coins + p_amount WHERE id = p_user_id RETURNING coins INTO result_balance;
  IF result_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;
  RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_coins_to_user(_user_id uuid, _amount integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can add coins';
  END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (auth.uid()::text, 'add_coins', _user_id::text, 'user', jsonb_build_object('amount', _amount, 'action', 'admin_coin_add'));
END;
$$;

CREATE OR REPLACE FUNCTION public.add_diamonds_to_agency(_agency_id uuid, _amount integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  UPDATE agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _amount WHERE id = _agency_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agency not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_diamonds_to_user(_user_id uuid, _amount integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _amount WHERE id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_to_helper_wallet(_helper_id uuid, _amount numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  UPDATE topup_helpers SET wallet_balance = COALESCE(wallet_balance, 0) + _amount WHERE id = _helper_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Helper not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_to_weekly_earnings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
DECLARE
  _receiver_is_host boolean;
  _beans_amount numeric;
  _host_percent numeric;
BEGIN
  SELECT is_host INTO _receiver_is_host FROM profiles WHERE id = NEW.receiver_id;
  IF _receiver_is_host = true THEN
    _host_percent := public.get_effective_host_percent();
    _beans_amount := FLOOR(NEW.coin_amount * _host_percent / 100);
    UPDATE profiles SET weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount WHERE id = NEW.receiver_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_beans_to_host(p_host_id uuid, p_beans_amount integer, p_total_earnings integer DEFAULT 0, p_host_level integer DEFAULT 1) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + p_beans_amount,
      beans_balance = COALESCE(beans_balance, 0) + p_beans_amount,
      total_earnings = COALESCE(total_earnings, 0) + p_total_earnings,
      host_level = GREATEST(COALESCE(host_level, 1), p_host_level),
      updated_at = now()
  WHERE id = p_host_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_agency_coins(_agency_id uuid, _amount numeric, _note text DEFAULT NULL) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _amount WHERE id = _agency_id;
  PERFORM public.log_admin_action('add_agency_coins', 'agency', _agency_id, jsonb_build_object('amount', _amount, 'note', _note));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_helper(_helper_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE topup_helpers SET is_verified = true, is_active = true, approved_at = now(), approved_by = auth.uid() WHERE id = _helper_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_block_agency(_agency_id uuid, _block boolean, _reason text DEFAULT NULL) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.admin_block_user(_user_id uuid, _block boolean, _reason text DEFAULT NULL) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.admin_change_user_role(_user_id uuid, _new_role text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _new_role NOT IN ('host', 'user') THEN RAISE EXCEPTION 'Invalid role value'; END IF;
  IF _new_role = 'host' THEN
    UPDATE profiles SET is_host = true, host_status = 'approved', updated_at = now() WHERE id = _user_id;
  ELSE
    UPDATE profiles SET is_host = false, host_status = NULL, updated_at = now() WHERE id = _user_id;
  END IF;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  PERFORM public.log_admin_action('change_user_role', 'profile', _user_id, jsonb_build_object('new_role', _new_role));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_frame_references(frame_id_to_clear uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles SET frame_id = NULL WHERE frame_id = frame_id_to_clear;
  UPDATE profiles SET equipped_frame_id = NULL WHERE equipped_frame_id = frame_id_to_clear;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_agency(_name text, _agency_code text, _owner_id uuid, _level text DEFAULT 'A1', _commission_rate numeric DEFAULT 2) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
DECLARE
  new_agency_id uuid;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only admins can create agencies'; END IF;
  INSERT INTO agencies (name, agency_code, owner_id, level, commission_rate, is_active, is_blocked, total_hosts, total_agents, wallet_balance)
  VALUES (_name, _agency_code, _owner_id, _level, _commission_rate, true, false, 0, 0, 0)
  RETURNING id INTO new_agency_id;
  IF _owner_id IS NOT NULL THEN
    UPDATE profiles SET is_agency_owner = true WHERE id = _owner_id;
  END IF;
  RETURN new_agency_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM profiles WHERE id = _user_id;
  PERFORM public.log_admin_action('delete_user', 'user', _user_id, jsonb_build_object('deleted', true));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_user_coins(_user_id uuid, _amount integer, _note text DEFAULT NULL) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
DECLARE
  _user_profile RECORD;
  _new_balance INTEGER;
  _new_consumption BIGINT;
  _new_level INTEGER;
  _is_female_host BOOLEAN;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  SELECT * INTO _user_profile FROM profiles WHERE id = _user_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'User not found'); END IF;
  _is_female_host := (_user_profile.is_host = true AND _user_profile.gender = 'female');
  _new_consumption := COALESCE(_user_profile.total_consumption, 0) + _amount;
  IF _is_female_host THEN
    _new_level := COALESCE(_user_profile.user_level, 0);
  ELSE
    _new_level := public.calculate_user_level(_new_consumption);
  END IF;
  UPDATE profiles SET coins = COALESCE(coins, 0) + _amount, total_consumption = _new_consumption, user_level = _new_level
  WHERE id = _user_id RETURNING coins INTO _new_balance;
  PERFORM public.log_admin_action('add_user_coins', 'user', _user_id,
    jsonb_build_object('amount', _amount, 'note', _note, 'new_balance', _new_balance, 'new_level', _new_level));
  RETURN json_build_object('success', true, 'user_id', _user_id, 'amount_added', _amount, 'new_balance', _new_balance, 'new_level', _new_level);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_violation(p_admin_id uuid, p_host_id uuid, p_detected_content text, p_detected_pattern text, p_source_type text, p_notes text DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
    AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_result JSONB;
  v_violation_id UUID;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = p_admin_id AND is_active = true) INTO v_is_admin;
  IF NOT v_is_admin THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized'); END IF;
  v_result := public.process_contact_violation(p_host_id, p_detected_content, p_detected_pattern, p_source_type, NULL);
  v_violation_id := (v_result->>'violation_id')::UUID;
  UPDATE public.host_contact_violations
  SET is_auto_detected = false, is_reviewed = true, reviewed_by = p_admin_id, reviewed_at = now(), review_notes = p_notes
  WHERE id = v_violation_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agency_by_code(agency_code TEXT)
RETURNS TABLE (id UUID, name TEXT, level TEXT, total_hosts INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, name, level, total_hosts FROM public.agencies
  WHERE agencies.agency_code = get_agency_by_code.agency_code AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.join_agency(_host_id UUID, _agency_code TEXT, _joined_via TEXT DEFAULT 'invitation')
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _agency_id UUID;
BEGIN
  SELECT id INTO _agency_id FROM public.agencies WHERE agency_code = _agency_code AND is_active = true;
  IF _agency_id IS NULL THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM public.agency_hosts WHERE host_id = _host_id) THEN RETURN FALSE; END IF;
  INSERT INTO public.agency_hosts (agency_id, host_id, joined_via, referral_code) VALUES (_agency_id, _host_id, _joined_via, _agency_code);
  UPDATE public.profiles SET agency_id = _agency_id WHERE id = _host_id;
  UPDATE public.agencies SET total_hosts = total_hosts + 1 WHERE id = _agency_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_coins_to_user(_sender_id uuid, _receiver_id uuid, _amount integer, _note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

CREATE OR REPLACE FUNCTION public.update_group_member_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE group_chat_rooms SET member_count = COALESCE(member_count, 0) + 1 WHERE id = NEW.room_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE group_chat_rooms SET member_count = GREATEST(COALESCE(member_count, 0) - 1, 0) WHERE id = OLD.room_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_room_participant_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE party_rooms SET current_participants = COALESCE(current_participants, 0) + 1 WHERE id = NEW.room_id;
  ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.left_at IS NOT NULL AND OLD.left_at IS NULL) THEN
    UPDATE party_rooms SET current_participants = GREATEST(COALESCE(current_participants, 0) - 1, 0) WHERE id = COALESCE(NEW.room_id, OLD.room_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stream_stats() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.live_streams SET viewer_count = COALESCE(viewer_count, 0) + 1 WHERE id = NEW.stream_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
    UPDATE public.live_streams SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0) WHERE id = NEW.stream_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_host_hours_on_stream_end() RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _period_start DATE;
  _duration_hours DECIMAL;
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    _duration_hours := EXTRACT(EPOCH FROM (NEW.ended_at - COALESCE(NEW.started_at, NEW.created_at))) / 3600;
    SELECT agency_id INTO _host_agency_id FROM public.profiles WHERE id = NEW.host_id;
    IF _host_agency_id IS NOT NULL THEN
      _period_start := date_trunc('week', CURRENT_DATE)::date;
      INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_host_hours)
      VALUES (_host_agency_id, 'weekly', _period_start, _duration_hours)
      ON CONFLICT (agency_id, period_type, period_start)
      DO UPDATE SET total_host_hours = COALESCE(agency_performance.total_host_hours, 0) + _duration_hours, updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_agency_performance_on_gift() RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _period_start DATE;
BEGIN
  SELECT agency_id INTO _host_agency_id FROM public.profiles WHERE id = NEW.receiver_id;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;
  _period_start := date_trunc('week', CURRENT_DATE)::date;
  INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
  VALUES (_host_agency_id, 'weekly', _period_start, NEW.coin_amount, NEW.coin_amount)
  ON CONFLICT (agency_id, period_type, period_start)
  DO UPDATE SET total_income = agency_performance.total_income + NEW.coin_amount,
    golden_host_income = agency_performance.golden_host_income + NEW.coin_amount, updated_at = now();
  UPDATE public.profiles SET total_earnings = COALESCE(total_earnings, 0) + NEW.coin_amount WHERE id = NEW.receiver_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP FUNCTION IF EXISTS public.admin_update_agency_level(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_add_agency_coins(_agency_id uuid, _amount numeric, _note text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE agencies
  SET wallet_balance = COALESCE(wallet_balance, 0) + _amount
  WHERE id = _agency_id;
  PERFORM public.log_admin_action(
    'add_agency_coins',
    'agency',
    _agency_id,
    jsonb_build_object('amount', _amount, 'note', _note)
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_block_agency(_agency_id uuid, _block boolean, _reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
    PERFORM public.log_admin_action(
        CASE WHEN _block THEN 'block_agency' ELSE 'unblock_agency' END,
        'agency',
        _agency_id,
        jsonb_build_object('reason', _reason)
    );
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _withdrawal RECORD;
  _diamond_reward NUMERIC;
  _platform_fee NUMERIC;
  _net_reward NUMERIC;
  _helper_user_id UUID;
  _net_beans NUMERIC;
  _agency_owner_id UUID;
  _is_payroll_helper BOOLEAN;
BEGIN
  SELECT aw.* INTO _withdrawal FROM agency_withdrawals aw WHERE aw.id = _withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found'); END IF;
  IF _withdrawal.status NOT IN ('pending', 'processing') THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition'); END IF;

  IF _status = 'approved' THEN
    _net_beans := _withdrawal.amount - COALESCE((_withdrawal.payment_details->>'platform_fee')::NUMERIC, ROUND(_withdrawal.amount * 0.05, 0));
    UPDATE agency_withdrawals SET status = _status, notes = _notes, processed_at = NOW(),
      payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('approved_at', NOW(), 'net_withdrawal_beans', _net_beans)
    WHERE id = _withdrawal_id;
    
    SELECT a.owner_id INTO _agency_owner_id FROM agencies a WHERE a.id = _withdrawal.agency_id;
    SELECT EXISTS(SELECT 1 FROM topup_helpers th WHERE th.user_id = _agency_owner_id AND th.is_verified = true AND th.payroll_enabled = true) INTO _is_payroll_helper;
    IF NOT _is_payroll_helper THEN
      UPDATE agencies SET commission_rate = 3, level = 'A1', updated_at = NOW() WHERE id = _withdrawal.agency_id;
    END IF;

    IF _withdrawal.assigned_helper_id IS NOT NULL AND _net_beans > 0 THEN
      _diamond_reward := _net_beans;
      _platform_fee := ROUND(_diamond_reward * 0.10, 2);
      _net_reward := _diamond_reward - _platform_fee;
      SELECT user_id INTO _helper_user_id FROM topup_helpers WHERE id = _withdrawal.assigned_helper_id;
      IF _helper_user_id IS NOT NULL THEN
        UPDATE topup_helpers SET wallet_balance = COALESCE(wallet_balance, 0) + _net_reward WHERE id = _withdrawal.assigned_helper_id;
        INSERT INTO notifications (user_id, type, title, message, data) VALUES (_helper_user_id, 'withdrawal_reward', 'Diamond Reward!', 'You received ' || ROUND(_net_reward)::TEXT || ' diamonds', jsonb_build_object('withdrawal_id', _withdrawal_id, 'net_reward', _net_reward));
      END IF;
    END IF;
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

CREATE OR REPLACE FUNCTION public.admin_remove_host_from_agency(_host_id uuid, _reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _agency_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT agency_id INTO _agency_id FROM agency_hosts WHERE host_id = _host_id AND status = 'active';
  IF _agency_id IS NULL THEN RETURN FALSE; END IF;
  UPDATE agency_hosts SET status = 'removed', left_at = now() WHERE host_id = _host_id AND agency_id = _agency_id;
  UPDATE profiles SET agency_id = NULL WHERE id = _host_id;
  UPDATE agencies SET total_hosts = GREATEST(total_hosts - 1, 0) WHERE id = _agency_id;
  PERFORM public.log_admin_action('remove_host_from_agency', 'host', _host_id, jsonb_build_object('agency_id', _agency_id, 'reason', _reason));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_agency_level(_agency_id uuid, _level text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE agencies SET level = _level WHERE id = _agency_id;
  PERFORM public.log_admin_action('update_agency_level', 'agency', _agency_id, jsonb_build_object('new_level', _level));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_app_uid() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.app_uid IS NULL THEN
    NEW.app_uid := public.generate_app_uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_level_frame() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_frame_id uuid;
  v_level integer;
BEGIN
  IF NEW.user_level IS DISTINCT FROM OLD.user_level THEN
    v_level := COALESCE(NEW.user_level, 1);
    SELECT af.id INTO v_frame_id FROM avatar_frames af WHERE af.is_active = true AND af.level_required <= v_level ORDER BY af.level_required DESC LIMIT 1;
    IF v_frame_id IS NOT NULL THEN NEW.frame_id := v_frame_id; END IF;
  END IF;
  IF NEW.host_level IS DISTINCT FROM OLD.host_level THEN
    v_level := COALESCE(NEW.host_level, 1);
    SELECT af.id INTO v_frame_id FROM avatar_frames af WHERE af.is_active = true AND af.level_required <= v_level ORDER BY af.level_required DESC LIMIT 1;
    IF v_frame_id IS NOT NULL THEN NEW.equipped_frame_id := v_frame_id; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_role_frame() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_assign_withdrawal_helper() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _helper_id UUID;
BEGIN
  SELECT id INTO _helper_id FROM topup_helpers WHERE is_active = TRUE AND is_verified = TRUE AND payroll_enabled = TRUE AND wallet_balance >= 300000 ORDER BY wallet_balance DESC LIMIT 1;
  IF _helper_id IS NOT NULL THEN NEW.assigned_helper_id := _helper_id; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_convert_account_by_gender() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.gender = 'female' THEN
    NEW.is_host := true; NEW.host_status := 'approved'; NEW.is_face_verified := true;
  ELSIF NEW.gender = 'male' THEN
    NEW.is_host := false; NEW.host_status := null; NEW.is_face_verified := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _host_agency_id UUID; _agency_level TEXT; _agency_commission_rate NUMERIC; _commission_amount NUMERIC; _host_earnings NUMERIC; _host_percent NUMERIC;
BEGIN
  SELECT ah.agency_id INTO _host_agency_id FROM agency_hosts ah WHERE ah.host_id = NEW.receiver_id AND ah.status = 'active' LIMIT 1;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;
  _host_percent := public.get_effective_host_percent();
  _host_earnings := FLOOR(NEW.coin_amount * _host_percent / 100);
  SELECT a.level INTO _agency_level FROM agencies a WHERE a.id = _host_agency_id;
  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate FROM agency_level_tiers alt WHERE alt.level_code = COALESCE(_agency_level, 'A1') AND alt.is_active = true;
  _commission_amount := FLOOR(_host_earnings * COALESCE(_agency_commission_rate, 3) / 100);
  IF _commission_amount > 0 THEN
    UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount WHERE id = _host_agency_id;
    INSERT INTO agency_commission_history (agency_id, host_id, transaction_type, original_amount, commission_rate, commission_amount, source_transaction_id, notes)
    VALUES (_host_agency_id, NEW.receiver_id, 'gift', _host_earnings, COALESCE(_agency_commission_rate, 3), _commission_amount, NEW.id, 'Gift commission');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission_from_call() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _host_agency_id UUID; _agency_level TEXT; _agency_commission_rate NUMERIC; _commission_amount NUMERIC; _host_earnings NUMERIC;
BEGIN
  IF NEW.status NOT IN ('ended', 'completed') OR OLD.status = NEW.status THEN RETURN NEW; END IF;
  SELECT ah.agency_id INTO _host_agency_id FROM agency_hosts ah WHERE ah.host_id = NEW.host_id AND ah.status = 'active' LIMIT 1;
  IF _host_agency_id IS NULL THEN RETURN NEW; END IF;
  _host_earnings := COALESCE(NEW.host_earned_beans, FLOOR(COALESCE(NEW.total_coins_spent, 0) * public.get_effective_host_percent() / 100));
  SELECT a.level INTO _agency_level FROM agencies a WHERE a.id = _host_agency_id;
  SELECT COALESCE(alt.commission_rate, 3) INTO _agency_commission_rate FROM agency_level_tiers alt WHERE alt.level_code = COALESCE(_agency_level, 'A1') AND alt.is_active = true;
  _commission_amount := FLOOR(_host_earnings * COALESCE(_agency_commission_rate, 3) / 100);
  IF _commission_amount > 0 THEN
    UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount WHERE id = _host_agency_id;
    INSERT INTO agency_commission_history (agency_id, host_id, transaction_type, original_amount, commission_rate, commission_amount, source_transaction_id, notes)
    VALUES (_host_agency_id, NEW.host_id, 'call', _host_earnings, COALESCE(_agency_commission_rate, 3), _commission_amount, NEW.id, 'Call commission');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_distribute_leaderboard_rewards() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_results TEXT := '';
  v_category RECORD;
  v_count INT;
BEGIN
  FOR v_category IN SELECT DISTINCT category, period_type FROM leaderboard_reward_config WHERE is_active = true
  LOOP
    SELECT COUNT(*) INTO v_count FROM leaderboard_reward_history WHERE category = v_category.category AND period_type = v_category.period_type
      AND distributed_at >= date_trunc(CASE v_category.period_type WHEN 'weekly' THEN 'week' WHEN 'monthly' THEN 'month' ELSE 'day' END, now());
    IF v_count = 0 THEN
      PERFORM public.distribute_period_rewards(v_category.category, v_category.period_type);
      v_results := v_results || v_category.category || '/' || v_category.period_type || ' distributed; ';
    END IF;
  END LOOP;
  IF v_results = '' THEN v_results := 'No distributions needed'; END IF;
  RETURN v_results;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_distribute_pk_rewards() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status = 'ended' AND OLD.status != 'ended' THEN
    PERFORM public.distribute_pk_rewards(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_finalize_face_verification(_submission_id uuid, _action text, _approve_as text DEFAULT 'user'::text, _set_gender text DEFAULT NULL::text, _reason text DEFAULT NULL::text, _tags text[] DEFAULT NULL::text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _submission RECORD;
  _gender_value text;
BEGIN
  SELECT * INTO _submission FROM face_verification_submissions WHERE id = _submission_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  _gender_value := COALESCE(_set_gender, CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  IF _action = 'approve' THEN
    UPDATE face_verification_submissions SET status = 'approved', verification_type = _approve_as, reviewed_at = now(), admin_notes = _reason, updated_at = now() WHERE id = _submission_id;
    UPDATE profiles SET is_verified = true, is_face_verified = true, face_verification_image = _submission.face_image_url, face_verified_at = now(), is_host = (_approve_as = 'host'), host_status = CASE WHEN _approve_as = 'host' THEN 'approved' ELSE NULL END, gender = _gender_value WHERE id = _submission.user_id;
    INSERT INTO notifications (user_id, title, message, type, data) VALUES (_submission.user_id, 'Face Verification Approved!', 'Your verification has been approved.', 'face_verification_approved', jsonb_build_object('submission_id', _submission_id));
  ELSIF _action = 'reject' THEN
    UPDATE face_verification_submissions SET status = 'rejected', reviewed_at = now(), rejection_reason = _reason, updated_at = now() WHERE id = _submission_id;
    UPDATE profiles SET is_face_verified = false, face_verification_image = NULL, face_verified_at = NULL WHERE id = _submission.user_id;
    INSERT INTO notifications (user_id, title, message, type, data) VALUES (_submission.user_id, 'Face Verification Rejected', COALESCE(_reason, 'Please try again.'), 'face_verification_rejected', jsonb_build_object('submission_id', _submission_id));
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_process_live_game() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE live_game_rounds SET status = 'playing' WHERE status = 'betting' AND betting_ends_at <= now();
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_recalc_host_level() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE new_level INTEGER;
BEGIN
  IF NEW.is_host = true AND (NEW.total_earnings IS DISTINCT FROM OLD.total_earnings) THEN
    new_level := CASE
      WHEN COALESCE(NEW.total_earnings, 0) >= 50000000 THEN 10 WHEN COALESCE(NEW.total_earnings, 0) >= 20000000 THEN 9
      WHEN COALESCE(NEW.total_earnings, 0) >= 10000000 THEN 8 WHEN COALESCE(NEW.total_earnings, 0) >= 5000000 THEN 7
      WHEN COALESCE(NEW.total_earnings, 0) >= 2000000 THEN 6 WHEN COALESCE(NEW.total_earnings, 0) >= 1000000 THEN 5
      WHEN COALESCE(NEW.total_earnings, 0) >= 500000 THEN 4 WHEN COALESCE(NEW.total_earnings, 0) >= 200000 THEN 3
      WHEN COALESCE(NEW.total_earnings, 0) >= 50000 THEN 2 ELSE 1 END;
    NEW.host_level := new_level;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_update_level() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.total_consumption IS DISTINCT FROM OLD.total_consumption THEN
    IF NEW.is_host = true AND NEW.gender = 'female' THEN RETURN NEW; END IF;
    NEW.user_level := public.calculate_user_level(COALESCE(NEW.total_consumption, 0));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_verify_gift_transactions() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _host_percent NUMERIC; _beans_amount INTEGER;
BEGIN
  IF NEW.status IS NULL OR NEW.status = 'pending' THEN
    _host_percent := public.get_effective_host_percent();
    _beans_amount := FLOOR(NEW.coin_amount * _host_percent / 100);
    NEW.beans_amount := _beans_amount;
    NEW.status := 'completed';
    NEW.credited_at := now();
    UPDATE profiles SET beans = COALESCE(beans, 0) + _beans_amount, pending_earnings = COALESCE(pending_earnings, 0) + _beans_amount, total_earnings = COALESCE(total_earnings, 0) + _beans_amount WHERE id = NEW.receiver_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ban_duplicate_face_attempt(_user_id uuid, _matched_user_id uuid, _face_hash text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE profiles SET is_blocked = true, blocked_at = now(), blocked_reason = 'Duplicate face detected (matched user: ' || _matched_user_id::text || ')' WHERE id = _user_id;
  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details) VALUES ('system', 'auto_ban_duplicate_face', _user_id::text, 'user', jsonb_build_object('matched_user_id', _matched_user_id, 'face_hash', _face_hash));
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_notice_to_users() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _user RECORD; _target text[];
BEGIN
  _target := NEW.target_audience;
  IF 'all' = ANY(_target) THEN
    FOR _user IN SELECT id FROM profiles WHERE is_deleted = false LOOP
      INSERT INTO notifications (user_id, type, title, message, data) VALUES (_user.id, 'notice', NEW.title, NEW.message, jsonb_build_object('notice_id', NEW.id, 'priority', NEW.priority, 'image_url', NEW.image_url)) ON CONFLICT DO NOTHING;
    END LOOP;
  ELSE
    IF 'hosts' = ANY(_target) THEN
      FOR _user IN SELECT id FROM profiles WHERE is_host = true AND is_deleted = false LOOP
        INSERT INTO notifications (user_id, type, title, message, data) VALUES (_user.id, 'notice', NEW.title, NEW.message, jsonb_build_object('notice_id', NEW.id, 'priority', NEW.priority)) ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
    IF 'users' = ANY(_target) THEN
      FOR _user IN SELECT id FROM profiles WHERE is_host = false AND is_deleted = false LOOP
        INSERT INTO notifications (user_id, type, title, message, data) VALUES (_user.id, 'notice', NEW.title, NEW.message, jsonb_build_object('notice_id', NEW.id, 'priority', NEW.priority)) ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_credit_call_earnings(_admin_id uuid, _call_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE _call RECORD; _credited INTEGER := 0; _skipped INTEGER := 0; _host_percent DECIMAL; _beans_earned INTEGER;
BEGIN
  IF NOT public.is_admin(_admin_id) THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized'); END IF;
  _host_percent := public.get_effective_host_percent();
  FOR _call IN SELECT * FROM private_calls WHERE id = ANY(_call_ids) AND status = 'ended' LOOP
    IF _call.host_earned_beans > 0 AND _call.earnings_credited = true THEN _skipped := _skipped + 1; CONTINUE; END IF;
    _beans_earned := COALESCE(_call.host_earned_beans, FLOOR(COALESCE(_call.total_coins_spent, 0) * _host_percent / 100));
    IF _beans_earned > 0 THEN
      UPDATE profiles SET beans = COALESCE(beans, 0) + _beans_earned, pending_earnings = COALESCE(pending_earnings, 0) + _beans_earned, total_earnings = COALESCE(total_earnings, 0) + _beans_earned WHERE id = _call.host_id;
      UPDATE private_calls SET host_earned_beans = _beans_earned, earnings_credited = true WHERE id = _call.id;
      _credited := _credited + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'credited', _credited, 'skipped', _skipped);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_commission(_amount numeric, _rate numeric) RETURNS numeric
    LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$ SELECT ROUND(_amount * _rate / 100, 2); $$;

CREATE OR REPLACE FUNCTION public.can_access_agency(_user_id uuid, _agency_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM agencies WHERE id = _agency_id AND owner_id = _user_id)
    OR EXISTS (SELECT 1 FROM agency_hosts WHERE agency_id = _agency_id AND host_id = _user_id AND status = 'active')
    OR public.is_admin(_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_party_room(_user_id uuid, _room_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM party_rooms WHERE id = _room_id AND (is_public = true OR owner_id = _user_id))
    OR EXISTS (SELECT 1 FROM party_room_participants WHERE room_id = _room_id AND user_id = _user_id AND left_at IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion(_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE profiles SET deletion_requested_at = NULL, deletion_scheduled_at = NULL WHERE id = _user_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_agency_request(_host_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  DELETE FROM agency_hosts WHERE host_id = _host_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_agency_host_compliance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.check_agency_minimum_hosts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.check_auto_ban_threshold() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM host_contact_violations WHERE host_id = NEW.host_id AND created_at > now() - interval '30 days' AND is_false_positive = false;
  IF v_count >= 3 THEN
    UPDATE profiles SET is_blocked = true, blocked_at = now(), blocked_reason = 'Auto-banned: ' || v_count || ' contact violations in 30 days' WHERE id = NEW.host_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_ban_on_login(_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _profile RECORD;
BEGIN
  SELECT is_blocked, blocked_reason, blocked_at INTO _profile FROM profiles WHERE id = _user_id;
  IF _profile.is_blocked = true THEN RETURN jsonb_build_object('banned', true, 'reason', _profile.blocked_reason, 'banned_at', _profile.blocked_at); END IF;
  RETURN jsonb_build_object('banned', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_brute_force(p_identifier text, p_action_type text, p_ip_address text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_failed_count INT; v_max_attempts INT := 5; v_cooldown_seconds INT := 0; v_lockout RECORD;
BEGIN
  SELECT * INTO v_lockout FROM account_lockouts WHERE identifier = p_identifier;
  IF v_lockout.locked_until IS NOT NULL AND v_lockout.locked_until > now() THEN
    RETURN jsonb_build_object('allowed', false, 'locked', true, 'locked_until', v_lockout.locked_until, 'remaining_seconds', EXTRACT(EPOCH FROM (v_lockout.locked_until - now()))::INT, 'failed_attempts', v_lockout.failed_attempts);
  END IF;
  SELECT COUNT(*) INTO v_failed_count FROM login_attempts WHERE identifier = p_identifier AND success = false AND attempted_at > now() - interval '1 hour';
  IF v_failed_count >= 10 THEN v_cooldown_seconds := 3600;
  ELSIF v_failed_count >= 7 THEN v_cooldown_seconds := 900;
  ELSIF v_failed_count >= v_max_attempts THEN v_cooldown_seconds := 300; END IF;
  IF v_cooldown_seconds > 0 THEN
    INSERT INTO account_lockouts (identifier, locked_until, failed_attempts) VALUES (p_identifier, now() + (v_cooldown_seconds || ' seconds')::interval, v_failed_count)
    ON CONFLICT (identifier) DO UPDATE SET locked_at = now(), locked_until = now() + (v_cooldown_seconds || ' seconds')::interval, failed_attempts = v_failed_count;
    RETURN jsonb_build_object('allowed', false, 'locked', true, 'locked_until', now() + (v_cooldown_seconds || ' seconds')::interval, 'remaining_seconds', v_cooldown_seconds, 'failed_attempts', v_failed_count);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'locked', false, 'failed_attempts', v_failed_count, 'attempts_remaining', v_max_attempts - v_failed_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_expired_items_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM restore_expired_items(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.check_group_membership(p_user_id uuid, p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.group_members WHERE user_id = p_user_id AND group_id = p_group_id)
$$;

CREATE OR REPLACE FUNCTION public.check_otp_rate_limit(p_email text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count FROM public.admin_login_otps WHERE email = p_email AND created_at > now() - interval '10 minutes';
  RETURN recent_count < 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(_user_id uuid, _action text, _max_per_hour integer DEFAULT 10) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count FROM admin_logs WHERE admin_id = _user_id::text AND action_type = _action AND created_at > NOW() - INTERVAL '1 hour';
  RETURN recent_count < _max_per_hour;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_room_active_on_participant_leave() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE active_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO active_count FROM party_room_participants WHERE room_id = NEW.room_id AND left_at IS NULL;
  IF active_count = 0 THEN UPDATE party_rooms SET is_active = false WHERE id = NEW.room_id; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_session_valid(p_user_id uuid, p_session_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_active_session TEXT;
BEGIN
  SELECT active_session_id INTO v_active_session FROM profiles WHERE id = p_user_id;
  IF v_active_session IS NULL THEN RETURN TRUE; END IF;
  RETURN v_active_session = p_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_user_permission(p_user_id uuid, p_permission text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN RETURN EXISTS (SELECT 1 FROM admin_users WHERE user_id = p_user_id AND is_active = true); END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_login_reward() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _user_id UUID; _last_claim RECORD; _next_day INT; _reward RECORD;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  SELECT * INTO _last_claim FROM daily_login_claims WHERE user_id = _user_id ORDER BY claimed_at DESC LIMIT 1;
  IF _last_claim.claimed_at IS NOT NULL AND _last_claim.claimed_at::date = CURRENT_DATE THEN RETURN jsonb_build_object('success', false, 'error', 'Already claimed today'); END IF;
  IF _last_claim.day_number IS NOT NULL AND _last_claim.claimed_at::date = CURRENT_DATE - 1 THEN _next_day := (_last_claim.day_number % 7) + 1; ELSE _next_day := 1; END IF;
  SELECT * INTO _reward FROM daily_login_rewards_config WHERE day_number = _next_day AND is_active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Reward config not found'); END IF;
  INSERT INTO daily_login_claims (user_id, reward_id, day_number, reward_type, reward_amount) VALUES (_user_id, _reward.id, _next_day, _reward.reward_type, _reward.reward_amount);
  IF _reward.reward_type = 'coins' THEN UPDATE profiles SET coins = COALESCE(coins, 0) + _reward.reward_amount WHERE id = _user_id;
  ELSIF _reward.reward_type = 'beans' THEN UPDATE profiles SET beans = COALESCE(beans, 0) + _reward.reward_amount WHERE id = _user_id;
  ELSIF _reward.reward_type = 'diamonds' THEN UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _reward.reward_amount WHERE id = _user_id; END IF;
  RETURN jsonb_build_object('success', true, 'day', _next_day, 'reward_type', _reward.reward_type, 'reward_amount', _reward.reward_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_invitation_reward(_user_id uuid, _coins integer DEFAULT 0, _beans integer DEFAULT 0, _diamonds integer DEFAULT 0) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE profiles SET coins = COALESCE(coins, 0) + _coins, beans = COALESCE(beans, 0) + _beans, diamonds = COALESCE(diamonds, 0) + _diamonds WHERE id = _user_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_new_host_live_bonus(_host_id uuid, _bonus_coins integer DEFAULT 500) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _profile RECORD; _stream_count INT;
BEGIN
  SELECT * INTO _profile FROM profiles WHERE id = _host_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF _profile.is_host != true THEN RETURN jsonb_build_object('success', false, 'error', 'Not a host'); END IF;
  IF _profile.new_host_bonus_claimed = true THEN RETURN jsonb_build_object('success', false, 'error', 'Bonus already claimed'); END IF;
  SELECT COUNT(*) INTO _stream_count FROM live_streams WHERE host_id = _host_id AND ended_at IS NOT NULL;
  IF _stream_count < 1 THEN RETURN jsonb_build_object('success', false, 'error', 'Must complete at least 1 live stream'); END IF;
  UPDATE profiles SET coins = COALESCE(coins, 0) + _bonus_coins, new_host_bonus_claimed = true WHERE id = _host_id;
  INSERT INTO notifications (user_id, type, title, message, data) VALUES (_host_id, 'bonus', 'New Host Bonus!', 'You received ' || _bonus_coins || ' coins!', jsonb_build_object('bonus_coins', _bonus_coins));
  RETURN jsonb_build_object('success', true, 'bonus_coins', _bonus_coins);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_parcel_reward(_parcel_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _user_id UUID; _parcel RECORD;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  SELECT * INTO _parcel FROM user_parcels WHERE id = _parcel_id AND user_id = _user_id AND status = 'available';
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Parcel not found or already claimed'); END IF;
  IF _parcel.expires_at IS NOT NULL AND _parcel.expires_at < now() THEN
    UPDATE user_parcels SET status = 'expired' WHERE id = _parcel_id;
    RETURN jsonb_build_object('success', false, 'error', 'Parcel expired');
  END IF;
  UPDATE user_parcels SET status = 'claimed', claimed_at = now() WHERE id = _parcel_id;
  IF _parcel.reward_type = 'coins' THEN UPDATE profiles SET coins = COALESCE(coins, 0) + _parcel.reward_amount WHERE id = _user_id;
  ELSIF _parcel.reward_type = 'beans' THEN UPDATE profiles SET beans = COALESCE(beans, 0) + _parcel.reward_amount WHERE id = _user_id;
  ELSIF _parcel.reward_type = 'diamonds' THEN UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _parcel.reward_amount WHERE id = _user_id; END IF;
  RETURN jsonb_build_object('success', true, 'reward_type', _parcel.reward_type, 'reward_amount', _parcel.reward_amount);
END;
$$;
CREATE OR REPLACE FUNCTION public.accept_private_call(_call_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.admin_credit_beans(_log_id uuid, _notes text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _log_record RECORD;
  _receiver_profile RECORD;
  _new_pending BIGINT;
  _new_earnings BIGINT;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  SELECT * INTO _log_record FROM gift_transaction_logs WHERE id = _log_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Log not found');
  END IF;
  IF _log_record.status = 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'Already credited');
  END IF;
  SELECT * INTO _receiver_profile FROM profiles WHERE id = _log_record.receiver_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Receiver not found');
  END IF;
  _new_pending := COALESCE(_receiver_profile.pending_earnings, 0) + _log_record.beans_amount;
  _new_earnings := COALESCE(_receiver_profile.total_earnings, 0) + _log_record.beans_amount;
  UPDATE profiles SET pending_earnings = _new_pending, total_earnings = _new_earnings WHERE id = _log_record.receiver_id;
  UPDATE gift_transaction_logs SET status = 'manual_credit', credited_at = now(), credited_by = auth.uid(), notes = COALESCE(_notes, 'Manually credited by admin'), updated_at = now() WHERE id = _log_id;
  PERFORM public.log_admin_action('manual_credit_beans', 'gift_transaction_logs', _log_id::text, jsonb_build_object('receiver_id', _log_record.receiver_id, 'beans_amount', _log_record.beans_amount, 'previous_pending', _receiver_profile.pending_earnings, 'new_pending', _new_pending, 'notes', _notes));
  RETURN json_build_object('success', true, 'beans_credited', _log_record.beans_amount, 'new_pending', _new_pending, 'new_earnings', _new_earnings);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_user_full_details(_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    result jsonb;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    SELECT jsonb_build_object(
        'id', p.id, 'display_name', p.display_name, 'username', p.username,
        'avatar_url', p.avatar_url, 'app_uid', p.app_uid, 'email', au.email,
        'phone', au.phone, 'gender', p.gender, 'country_name', p.country_name,
        'is_host', p.is_host, 'is_verified', p.is_verified, 'is_blocked', p.is_blocked,
        'blocked_at', p.blocked_at, 'blocked_reason', p.blocked_reason,
        'is_online', p.is_online, 'last_seen_at', p.last_seen_at,
        'user_level', p.user_level, 'host_level', p.host_level,
        'coins', p.coins, 'total_earnings', p.total_earnings,
        'pending_earnings', p.pending_earnings, 'total_consumption', p.total_consumption,
        'host_status', p.host_status, 'call_rate_per_minute', p.call_rate_per_minute,
        'created_at', p.created_at, 'bio', p.bio,
        'agency', (SELECT jsonb_build_object('id', a.id, 'name', a.name, 'agency_code', a.agency_code) FROM public.agency_hosts ah JOIN public.agencies a ON a.id = ah.agency_id WHERE ah.host_id = p.id AND ah.status = 'active' LIMIT 1),
        'followers_count', (SELECT COUNT(*) FROM public.followers WHERE following_id = p.id),
        'following_count', (SELECT COUNT(*) FROM public.followers WHERE follower_id = p.id),
        'total_gifts_received', (SELECT COALESCE(SUM(coin_value), 0) FROM public.gift_transactions WHERE receiver_id = p.id),
        'total_calls', (SELECT COUNT(*) FROM public.private_calls WHERE caller_id = p.id OR receiver_id = p.id),
        'auth_provider', au.raw_app_meta_data->>'provider',
        'last_sign_in', au.last_sign_in_at,
        'email_confirmed', au.email_confirmed_at IS NOT NULL
    ) INTO result
    FROM public.profiles p LEFT JOIN auth.users au ON au.id = p.id WHERE p.id = _user_id;
    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_face_verification(_submission_id uuid, _action text, _approve_as text DEFAULT 'user'::text, _set_gender text DEFAULT NULL::text, _reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _submission RECORD;
  _gender_value text;
  _notif_title text;
  _notif_message text;
  _notif_type text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO _submission FROM face_verification_submissions WHERE id = _submission_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  _gender_value := COALESCE(_set_gender, CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  IF _action = 'approve' THEN
    UPDATE face_verification_submissions SET status = 'approved', verification_type = _approve_as, reviewed_by = auth.uid(), reviewed_at = now(), admin_notes = _reason, updated_at = now() WHERE id = _submission_id;
    IF _approve_as = 'host' THEN
      UPDATE profiles SET is_verified = true, is_face_verified = true, face_verification_image = _submission.face_image_url, face_verified_at = now(), is_host = true, host_status = 'approved', gender = _gender_value WHERE id = _submission.user_id;
    ELSE
      UPDATE profiles SET is_verified = true, is_face_verified = true, face_verification_image = _submission.face_image_url, face_verified_at = now(), is_host = false, host_status = NULL, gender = _gender_value WHERE id = _submission.user_id;
    END IF;
    INSERT INTO notifications (user_id, title, message, type, data) VALUES (_submission.user_id, '✅ Face Verification Approved!', 'Congratulations! Your face verification has been approved as ' || CASE WHEN _approve_as = 'host' THEN 'Host' ELSE 'Verified User' END || '.', 'face_verification_approved', jsonb_build_object('submission_id', _submission_id, 'approved_as', _approve_as, 'gender', _gender_value));
  ELSIF _action = 'reject' THEN
    UPDATE face_verification_submissions SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = _reason, updated_at = now() WHERE id = _submission_id;
    UPDATE profiles SET is_face_verified = false, face_verification_image = NULL, face_verified_at = NULL WHERE id = _submission.user_id;
    INSERT INTO notifications (user_id, title, message, type, data) VALUES (_submission.user_id, 'Face Verification Rejected', COALESCE('Reason: ' || _reason, 'Please try again with a clear photo.'), 'face_verification_rejected', jsonb_build_object('submission_id', _submission_id, 'rejection_reason', COALESCE(_reason, '')));
  END IF;
  PERFORM public.log_admin_action('process_face_verification', 'face_verification', _submission_id, jsonb_build_object('action', _action, 'approve_as', _approve_as, 'gender', _gender_value, 'user_id', _submission.user_id, 'reason', _reason));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_helper_transaction(_transaction_id uuid, _action text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _txn RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO _txn FROM helper_transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF _action = 'approve' AND _txn.transaction_type = 'buy_from_platform' THEN
    UPDATE helper_transactions SET status = 'completed', processed_at = now(), processed_by = auth.uid() WHERE id = _transaction_id;
    UPDATE topup_helpers SET wallet_balance = wallet_balance + _txn.coin_amount, total_bought = total_bought + _txn.coin_amount WHERE id = _txn.helper_id;
  ELSIF _action = 'reject' THEN
    UPDATE helper_transactions SET status = 'failed', processed_at = now(), processed_by = auth.uid() WHERE id = _transaction_id;
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _withdrawal RECORD;
  _helper_id UUID;
  _diamond_reward NUMERIC;
  _platform_fee NUMERIC;
  _net_reward NUMERIC;
  _helper_user_id UUID;
  _usd_amount NUMERIC;
  _net_beans NUMERIC;
  _agency_owner_id UUID;
  _is_payroll_helper BOOLEAN;
BEGIN
  SELECT aw.*, COALESCE((aw.payment_details->>'net_withdrawal_beans')::NUMERIC, aw.amount - COALESCE(aw.platform_fee_amount, 0)) AS net_withdrawal_beans
  INTO _withdrawal FROM agency_withdrawals aw WHERE aw.id = _withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found'); END IF;
  IF _withdrawal.status NOT IN ('pending', 'processing') THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition'); END IF;
  IF _status = 'approved' THEN
    _net_beans := COALESCE((_withdrawal.payment_details->>'net_withdrawal_beans')::NUMERIC, _withdrawal.amount - COALESCE((_withdrawal.payment_details->>'platform_fee')::NUMERIC, ROUND(_withdrawal.amount * 0.05, 0)));
    UPDATE agency_withdrawals SET status = _status, notes = _notes, processed_at = NOW(), payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('approved_at', NOW(), 'net_withdrawal_beans', _net_beans) WHERE id = _withdrawal_id;
    SELECT a.owner_id INTO _agency_owner_id FROM agencies a WHERE a.id = _withdrawal.agency_id;
    SELECT EXISTS(SELECT 1 FROM topup_helpers th WHERE th.user_id = _agency_owner_id AND th.is_verified = true AND th.payroll_enabled = true) INTO _is_payroll_helper;
    IF NOT _is_payroll_helper THEN
      UPDATE agencies SET commission_rate = 3, level = 'A1', updated_at = NOW() WHERE id = _withdrawal.agency_id;
    END IF;
    IF _withdrawal.assigned_helper_id IS NOT NULL THEN
      _diamond_reward := _net_beans;
      IF _diamond_reward > 0 THEN
        _platform_fee := ROUND(_diamond_reward * 0.10, 2);
        _net_reward := _diamond_reward - _platform_fee;
        SELECT user_id INTO _helper_user_id FROM topup_helpers WHERE id = _withdrawal.assigned_helper_id;
        IF _helper_user_id IS NOT NULL THEN
          UPDATE agency_withdrawals SET diamond_reward = _diamond_reward, platform_fee_amount = _platform_fee, helper_net_reward = _net_reward WHERE id = _withdrawal_id;
          UPDATE topup_helpers SET wallet_balance = COALESCE(wallet_balance, 0) + _net_reward WHERE id = _withdrawal.assigned_helper_id;
          INSERT INTO notifications (user_id, type, title, message, data) VALUES (_helper_user_id, 'withdrawal_reward', 'Diamond Reward Received!', 'You received ' || ROUND(_net_reward)::TEXT || ' diamonds for processing withdrawal', jsonb_build_object('withdrawal_id', _withdrawal_id, 'gross_reward', _diamond_reward, 'platform_fee', _platform_fee, 'net_reward', _net_reward, 'agency_id', _withdrawal.agency_id));
        END IF;
      END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal approved', 'notes', _notes, 'helper_id', _withdrawal.assigned_helper_id, 'diamond_reward', _diamond_reward, 'platform_fee', _platform_fee, 'net_reward', _net_reward, 'commission_reset', NOT _is_payroll_helper);
  ELSE
    UPDATE agency_withdrawals SET status = _status, notes = _notes, processed_at = NOW() WHERE id = _withdrawal_id;
    IF _status = 'rejected' THEN
      UPDATE agencies SET beans_balance = COALESCE(beans_balance, 0) + _withdrawal.amount WHERE id = _withdrawal.agency_id;
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal ' || _status);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_face_verification(_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles SET is_verified = false, is_face_verified = false, face_verified_at = null WHERE id = _user_id;
  DELETE FROM face_verification_submissions WHERE user_id = _user_id;
  RETURN true;
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
  UPDATE agency_hosts SET status = 'left', left_at = now() WHERE host_id = _host_id AND status = 'active';
  UPDATE profiles SET agency_id = NULL WHERE id = _host_id;
  UPDATE agencies SET total_hosts = GREATEST(total_hosts - 1, 0) WHERE id = _agency_id;
  PERFORM public.log_admin_action('remove_host_from_agency', 'agency_host', _host_id, jsonb_build_object('agency_id', _agency_id, 'reason', _reason));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_face_verification(_user_id uuid, _verified boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE profiles SET is_face_verified = _verified, face_verified_at = CASE WHEN _verified THEN now() ELSE NULL END WHERE id = _user_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_agency_level(_agency_id uuid, _new_level text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.admin_update_user_gender(_user_id uuid, _gender text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _gender NOT IN ('male', 'female', 'other') THEN RAISE EXCEPTION 'Invalid gender value'; END IF;
  UPDATE profiles SET gender = _gender, updated_at = now() WHERE id = _user_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  PERFORM public.log_admin_action('update_user_gender', 'profile', _user_id, jsonb_build_object('new_gender', _gender));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_agency(_from_agency_id uuid, _to_agency_id uuid, _amount integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  UPDATE agencies SET diamond_balance = diamond_balance - _amount WHERE id = _from_agency_id AND diamond_balance >= _amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient diamond balance'; END IF;
  UPDATE agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _amount WHERE id = _to_agency_id;
  INSERT INTO agency_diamond_transactions (agency_id, transaction_type, diamond_amount, user_id) VALUES (_from_agency_id, 'transfer_out', _amount, NULL);
  INSERT INTO agency_diamond_transactions (agency_id, transaction_type, diamond_amount, user_id) VALUES (_to_agency_id, 'transfer_in', _amount, NULL);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_user(_agency_id uuid, _user_id uuid, _amount integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  UPDATE agencies SET diamond_balance = diamond_balance - _amount WHERE id = _agency_id AND diamond_balance >= _amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient diamond balance'; END IF;
  UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + _amount WHERE id = _user_id;
  INSERT INTO agency_diamond_transactions (agency_id, transaction_type, diamond_amount, user_id) VALUES (_agency_id, 'send_to_user', _amount, _user_id);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_as_topup_helper(_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _user_id UUID;
  _helper_id UUID;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM topup_helpers WHERE user_id = _user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already applied');
  END IF;
  INSERT INTO topup_helpers (user_id, helper_name, whatsapp_number, payment_methods, country_code, notes)
  VALUES (_user_id, _data->>'helper_name', _data->>'whatsapp_number', COALESCE((_data->'payment_methods')::jsonb, '[]'::jsonb), _data->>'country_code', _data->>'notes')
  RETURNING id INTO _helper_id;
  RETURN jsonb_build_object('success', true, 'helper_id', _helper_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_host_request(_request_id uuid, _admin_id uuid, _agency_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _user_id UUID;
BEGIN
  SELECT user_id INTO _user_id FROM host_applications WHERE id = _request_id AND status = 'pending';
  IF _user_id IS NULL THEN RETURN FALSE; END IF;
  UPDATE host_applications SET status = 'approved', reviewed_by = _admin_id, reviewed_at = now() WHERE id = _request_id;
  UPDATE profiles SET is_host = true, host_status = 'approved', agency_id = _agency_id WHERE id = _user_id;
  IF _agency_id IS NOT NULL THEN
    INSERT INTO agency_hosts (agency_id, host_id, status) VALUES (_agency_id, _user_id, 'active') ON CONFLICT DO NOTHING;
    UPDATE agencies SET total_hosts = total_hosts + 1 WHERE id = _agency_id;
  END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_rating_reward(_reward_id uuid, _admin_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_reward RECORD;
  v_result jsonb;
BEGIN
  IF NOT public.is_admin(_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  SELECT * INTO v_reward FROM rating_rewards WHERE id = _reward_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Reward not found'); END IF;
  IF v_reward.status != 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'Already processed'); END IF;
  UPDATE rating_rewards SET status = 'approved', approved_by = _admin_id, approved_at = now() WHERE id = _reward_id;
  IF v_reward.reward_type = 'coins' THEN
    UPDATE profiles SET coins = COALESCE(coins, 0) + v_reward.reward_amount WHERE id = v_reward.user_id;
  ELSIF v_reward.reward_type = 'beans' THEN
    UPDATE profiles SET beans = COALESCE(beans, 0) + v_reward.reward_amount WHERE id = v_reward.user_id;
  END IF;
  INSERT INTO notifications (user_id, type, title, message, data) VALUES (v_reward.user_id, 'reward_approved', 'Rating Reward Approved!', 'You received ' || v_reward.reward_amount || ' ' || v_reward.reward_type, jsonb_build_object('reward_id', _reward_id, 'amount', v_reward.reward_amount, 'type', v_reward.reward_type));
  RETURN jsonb_build_object('success', true, 'reward_id', _reward_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_payroll_to_trader(_withdrawal_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  _withdrawal RECORD;
  _helper RECORD;
  _result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized'); END IF;
  SELECT * INTO _withdrawal FROM agency_withdrawals WHERE id = _withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found'); END IF;
  SELECT th.* INTO _helper FROM topup_helpers th WHERE th.is_verified = true AND th.is_active = true AND th.payroll_enabled = true AND COALESCE(th.wallet_balance, 0) >= _withdrawal.amount ORDER BY th.wallet_balance DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'No eligible payroll trader found'); END IF;
  UPDATE agency_withdrawals SET assigned_helper_id = _helper.id, status = 'processing', payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('assigned_trader', _helper.helper_name, 'assigned_at', now()) WHERE id = _withdrawal_id;
  UPDATE topup_helpers SET wallet_balance = wallet_balance - _withdrawal.amount WHERE id = _helper.id;
  RETURN jsonb_build_object('success', true, 'helper_id', _helper.id, 'helper_name', _helper.helper_name);
END;
$$;
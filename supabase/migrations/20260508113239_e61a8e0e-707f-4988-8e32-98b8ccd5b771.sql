
-- ============================================================
-- Helper: owner session detection from x-admin-token header
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_active_owner_session()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.id = public.current_admin_id_from_header()
      AND au.is_active = true
      AND au.role = 'owner'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_active_owner_session() TO authenticated, anon;

-- Convenience: caller is owner via either auth.uid OR admin session
CREATE OR REPLACE FUNCTION public.is_caller_owner()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_active_owner_session() THEN RETURN true; END IF;
  IF auth.uid() IS NOT NULL AND public.is_owner(auth.uid()) THEN RETURN true; END IF;
  RETURN false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_caller_owner() TO authenticated, anon;

-- Convenience: caller is admin via either auth.uid OR admin session
CREATE OR REPLACE FUNCTION public.is_caller_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_active_admin_session() THEN RETURN true; END IF;
  IF auth.uid() IS NOT NULL AND public.is_admin(auth.uid()) THEN RETURN true; END IF;
  RETURN false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_caller_admin() TO authenticated, anon;

-- ============================================================
-- admin_list_admin_users: drop the auth.uid IS NULL gate
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_admin_users(_include_inactive boolean DEFAULT true)
 RETURNS TABLE(id uuid, user_id uuid, email text, display_name text, normalized_display_name text, role text, is_active boolean, invited_at timestamp with time zone, accepted_at timestamp with time zone, last_login_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_caller_admin() THEN
    RAISE EXCEPTION 'Only admins can list admin users';
  END IF;
  RETURN QUERY
  SELECT au.id, au.user_id, au.email, au.display_name,
    COALESCE(NULLIF(trim(COALESCE(au.display_name, '')), ''),
             CASE WHEN au.role = 'owner' THEN 'Owner'
                  ELSE split_part(COALESCE(au.email, 'sub-admin'), '@', 1) END),
    au.role::TEXT, COALESCE(au.is_active, false),
    au.invited_at, au.accepted_at, au.last_login_at, au.created_at
  FROM public.admin_users au
  WHERE (_include_inactive OR COALESCE(au.is_active, false) = true)
    AND NOT (au.role = 'owner' AND au.user_id IS NULL
             AND lower(COALESCE(au.email, '')) = 'owner@merilive.com')
  ORDER BY CASE WHEN au.role = 'owner' THEN 0 ELSE 1 END, au.created_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_admin_users(boolean) TO authenticated, anon;

-- ============================================================
-- admin_list_helper_orders (overload with filters)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_list_helper_orders(_status text DEFAULT NULL::text, _search text DEFAULT NULL::text, _limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, helper_id uuid, user_id uuid, customer_id uuid, coin_amount integer, amount_usd numeric, amount_local numeric, currency_code text, payment_method text, status text, user_payment_proof text, helper_notes text, processed_at timestamp with time zone, created_at timestamp with time zone, user_country_code text, helper_user_id uuid, helper_wallet_balance numeric, helper_display_name text, helper_avatar_url text, helper_app_uid text, customer_display_name text, customer_avatar_url text, customer_app_uid text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_caller_admin() THEN
    RAISE EXCEPTION 'Only admins can list helper orders';
  END IF;
  RETURN QUERY
  SELECT ho.id, ho.helper_id, ho.user_id, ho.customer_id,
    COALESCE(ho.coin_amount, ho.diamond_amount, 0),
    COALESCE(ho.amount_usd, ho.total_price_usd, 0),
    COALESCE(ho.amount_local, ho.local_price, 0),
    COALESCE(ho.currency_code, ho.local_currency, ''),
    COALESCE(ho.payment_method, ''),
    COALESCE(ho.status, 'pending'),
    ho.user_payment_proof, ho.notes, ho.processed_at, ho.created_at, ho.user_country_code,
    th.user_id, th.wallet_balance,
    hp.display_name, hp.avatar_url, hp.app_uid::TEXT,
    cp.display_name, cp.avatar_url, cp.app_uid::TEXT
  FROM public.helper_orders ho
  LEFT JOIN public.topup_helpers th ON th.id = ho.helper_id
  LEFT JOIN public.profiles hp ON hp.id = th.user_id
  LEFT JOIN public.profiles cp ON cp.id = COALESCE(ho.user_id, ho.customer_id)
  WHERE (_status IS NULL OR _status = '' OR lower(_status) = 'all'
         OR COALESCE(ho.status, 'pending') = _status)
    AND (_search IS NULL OR trim(_search) = ''
         OR ho.id::TEXT ILIKE '%' || trim(_search) || '%'
         OR COALESCE(cp.display_name, '') ILIKE '%' || trim(_search) || '%'
         OR COALESCE(cp.app_uid::TEXT, '') ILIKE '%' || trim(_search) || '%'
         OR COALESCE(hp.display_name, '') ILIKE '%' || trim(_search) || '%'
         OR COALESCE(hp.app_uid::TEXT, '') ILIKE '%' || trim(_search) || '%')
  ORDER BY ho.created_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(_limit, 500), 1);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_helper_orders(text, text, integer) TO authenticated, anon;

-- ============================================================
-- admin_permanent_ban_step_one
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_permanent_ban_step_one(_target_user_id uuid, _reason text, _evidence jsonb DEFAULT '[]'::jsonb, _include_gift_links boolean DEFAULT true, _lookback_days integer DEFAULT 90)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_case_id UUID;
  v_count INTEGER := 0;
  v_admin_id UUID;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RAISE EXCEPTION 'Only admins can start permanent ban cases';
  END IF;
  v_admin_id := COALESCE(auth.uid(), public.current_admin_id_from_header());
  IF _target_user_id IS NULL THEN RAISE EXCEPTION 'Target user is required'; END IF;
  IF COALESCE(trim(_reason), '') = '' THEN RAISE EXCEPTION 'Reason is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = _target_user_id AND au.is_active = true) THEN
    RAISE EXCEPTION 'Active admin/owner accounts cannot be targeted by permanent bans';
  END IF;

  INSERT INTO public.admin_permanent_ban_cases (
    target_user_id, initiated_by, reason, evidence, include_gift_links, lookback_days, status)
  VALUES (_target_user_id, v_admin_id, trim(_reason), COALESCE(_evidence, '[]'::jsonb),
          COALESCE(_include_gift_links, true), GREATEST(COALESCE(_lookback_days, 90), 1), 'step1_created')
  RETURNING id INTO v_case_id;

  INSERT INTO public.admin_permanent_ban_case_targets (case_id, user_id, source, relation_details)
  SELECT v_case_id, t.user_id, t.source, t.relation_details
  FROM public.admin_resolve_permanent_ban_targets(_target_user_id, GREATEST(COALESCE(_lookback_days, 90), 1)) t
  WHERE _include_gift_links = true OR t.source = 'primary';

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.admin_permanent_ban_case_targets WHERE case_id = v_case_id;

  UPDATE public.admin_permanent_ban_cases SET linked_target_count = v_count WHERE id = v_case_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (v_admin_id, 'permanent_ban_step1_created', 'profile', _target_user_id::TEXT,
          jsonb_build_object('case_id', v_case_id, 'linked_target_count', v_count,
                             'include_gift_links', COALESCE(_include_gift_links, true),
                             'lookback_days', GREATEST(COALESCE(_lookback_days, 90), 1)));
  RETURN v_case_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_permanent_ban_step_one(uuid, text, jsonb, boolean, integer) TO authenticated, anon;

-- ============================================================
-- admin_permanent_ban_step_two
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_permanent_ban_step_two(_case_id uuid, _review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_case public.admin_permanent_ban_cases%ROWTYPE;
  v_admin_id UUID;
BEGIN
  IF NOT public.is_caller_owner() THEN
    RAISE EXCEPTION 'Only owners can approve permanent ban step 2';
  END IF;
  v_admin_id := COALESCE(auth.uid(), public.current_admin_id_from_header());

  SELECT * INTO v_case FROM public.admin_permanent_ban_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permanent ban case not found'; END IF;
  IF v_case.status <> 'step1_created' THEN RAISE EXCEPTION 'Case is not ready for step 2'; END IF;

  UPDATE public.admin_permanent_ban_cases
  SET status = 'step2_approved', reviewed_by = v_admin_id, reviewed_at = now(),
      review_note = NULLIF(trim(COALESCE(_review_note, '')), '')
  WHERE id = _case_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (v_admin_id, 'permanent_ban_step2_approved', 'profile', v_case.target_user_id::TEXT,
          jsonb_build_object('case_id', _case_id));
  RETURN jsonb_build_object('case_id', _case_id, 'status', 'step2_approved',
                            'linked_target_count', v_case.linked_target_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_permanent_ban_step_two(uuid, text) TO authenticated, anon;

-- ============================================================
-- admin_permanent_ban_step_three: was already calling is_active_owner_session
-- Now resolve admin id properly
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_permanent_ban_step_three(_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_case public.admin_permanent_ban_cases%ROWTYPE;
  v_target RECORD;
  v_affected UUID[] := ARRAY[]::UUID[];
  v_summary JSONB;
  v_admin_id UUID;
BEGIN
  IF NOT public.is_caller_owner() THEN
    RAISE EXCEPTION 'Only owners can execute permanent ban step 3';
  END IF;
  v_admin_id := COALESCE(auth.uid(), public.current_admin_id_from_header());

  SELECT * INTO v_case FROM public.admin_permanent_ban_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permanent ban case not found'; END IF;
  IF v_case.status <> 'step2_approved' THEN
    RAISE EXCEPTION 'Case must complete step 2 before execution';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  FOR v_target IN
    SELECT user_id, source FROM public.admin_permanent_ban_case_targets WHERE case_id = _case_id
  LOOP
    UPDATE public.profiles
    SET is_blocked = true, is_online = false,
        blocked_at = COALESCE(blocked_at, now()),
        blocked_reason = CONCAT('Permanent ban • ', v_case.reason)
    WHERE id = v_target.user_id;

    UPDATE public.live_bans
    SET is_active = false, unbanned_by = v_admin_id, unbanned_at = now(),
        unban_reason = CONCAT('Superseded by permanent ban case ', _case_id::TEXT)
    WHERE user_id = v_target.user_id AND is_active = true;

    INSERT INTO public.live_bans (
      user_id, banned_by, reason, ban_type, ban_duration_hours, expires_at,
      is_active, ban_reason, violation_type, warning_count, ban_start, ban_end, auto_banned)
    VALUES (
      v_target.user_id, v_admin_id, v_case.reason, 'permanent', NULL, NULL, true,
      v_case.reason,
      CASE WHEN v_target.source = 'primary' THEN 'permanent_ban_primary' ELSE 'permanent_ban_gift_link' END,
      0, now(), NULL, false);

    UPDATE public.agency_hosts
    SET status = 'banned', left_at = COALESCE(left_at, now())
    WHERE host_id = v_target.user_id AND COALESCE(status, 'active') = 'active';

    v_affected := array_append(v_affected, v_target.user_id);
  END LOOP;

  v_summary := jsonb_build_object('affected_users', v_affected,
                                  'affected_count', COALESCE(array_length(v_affected, 1), 0),
                                  'executed_at', now());

  UPDATE public.admin_permanent_ban_cases
  SET status = 'step3_executed', executed_by = v_admin_id, executed_at = now(), execution_summary = v_summary
  WHERE id = _case_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (v_admin_id, 'permanent_ban_step3_executed', 'profile', v_case.target_user_id::TEXT,
          jsonb_build_object('case_id', _case_id, 'summary', v_summary));
  RETURN v_summary;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_permanent_ban_step_three(uuid) TO authenticated, anon;

-- ============================================================
-- admin_force_verify_and_approve_host: caller id from either source
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_force_verify_and_approve_host(_user_id uuid, _approve_as text DEFAULT 'host'::text, _set_gender text DEFAULT NULL::text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _caller_id uuid;
  _existing RECORD;
  _final_gender text;
  _face_url text;
  _safe_url text;
  _submission_id uuid;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  _caller_id := COALESCE(auth.uid(), public.current_admin_id_from_header());

  SELECT id, gender, avatar_url, face_verification_image
    INTO _existing FROM profiles WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User profile not found'; END IF;

  _final_gender := COALESCE(NULLIF(_set_gender, ''), NULLIF(_existing.gender, ''),
    CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  _face_url := COALESCE(_existing.face_verification_image, _existing.avatar_url);
  _safe_url := COALESCE(_face_url, 'admin-approved://no-image');

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _approve_as = 'host' THEN
    UPDATE profiles
       SET is_verified = true, is_face_verified = true,
           face_verification_image = _face_url, face_verified_at = now(),
           is_host = true, host_status = 'approved',
           gender = _final_gender, updated_at = now()
     WHERE id = _user_id;
  ELSE
    UPDATE profiles
       SET is_verified = true, is_face_verified = true,
           face_verification_image = _face_url, face_verified_at = now(),
           gender = _final_gender, updated_at = now()
     WHERE id = _user_id;
  END IF;

  UPDATE face_verification_submissions
     SET status = 'approved', verification_type = _approve_as,
         reviewed_by = _caller_id, reviewed_at = now(),
         admin_notes = COALESCE(_reason, 'Admin force-approved')
   WHERE user_id = _user_id AND status IN ('pending', 'under_review');

  IF NOT EXISTS (SELECT 1 FROM face_verification_submissions WHERE user_id = _user_id AND status = 'approved') THEN
    INSERT INTO face_verification_submissions
      (user_id, status, verification_type, face_image_url, selfie_url,
       reviewed_by, reviewed_at, admin_notes, created_at)
    VALUES
      (_user_id, 'approved', _approve_as, _safe_url, _safe_url,
       _caller_id, now(),
       COALESCE(_reason, 'Admin direct approval (no submission)'), now())
    RETURNING id INTO _submission_id;
  END IF;

  INSERT INTO notifications (user_id, title, message, type, data)
  VALUES (_user_id, '✅ Verification Approved!',
    'Your account has been verified by admin' ||
      CASE WHEN _approve_as = 'host' THEN ' and approved as a Host. You can now go live!' ELSE '.' END,
    'face_verification_approved',
    jsonb_build_object('approved_as', _approve_as, 'gender', _final_gender, 'forced', true));

  PERFORM public.log_admin_action('force_verify_approve_host', 'profile', _user_id::text,
    jsonb_build_object('approve_as', _approve_as, 'gender', _final_gender, 'reason', _reason));

  RETURN jsonb_build_object('success', true, 'user_id', _user_id,
    'approved_as', _approve_as, 'gender', _final_gender, 'submission_id', _submission_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_force_verify_and_approve_host(uuid, text, text, text) TO authenticated, anon;

-- ============================================================
-- admin_get_user_full_details: rely on caller-admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_get_user_full_details(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_caller_admin() THEN
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
GRANT EXECUTE ON FUNCTION public.admin_get_user_full_details(uuid) TO authenticated, anon;

-- ============================================================
-- admin_convert_user_role
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_convert_user_role(_user_id uuid, _to_host boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _new_gender text;
  _new_host_status text;
  _new_is_host boolean;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _to_host THEN
    _new_gender := 'female'; _new_is_host := true; _new_host_status := 'approved';
  ELSE
    _new_gender := 'male'; _new_is_host := false; _new_host_status := NULL;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET gender = _new_gender, is_host = _new_is_host,
      host_status = _new_host_status, updated_at = now()
  WHERE id = _user_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  INSERT INTO public.notifications (user_id, title, message, type, data)
  VALUES (_user_id,
    CASE WHEN _to_host THEN '🎤 Host Account Activated!' ELSE '👤 Converted to User Account' END,
    CASE WHEN _to_host THEN 'Your account has been converted to Host. You can now go live!'
         ELSE 'Your account has been converted to a regular user account.' END,
    'system',
    jsonb_build_object('action', CASE WHEN _to_host THEN 'converted_to_host' ELSE 'converted_to_user' END));

  PERFORM public.log_admin_action('admin_convert_user_role', 'profile', _user_id,
    jsonb_build_object('to_host', _to_host, 'new_gender', _new_gender, 'new_host_status', _new_host_status));

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_convert_user_role(uuid, boolean) TO authenticated, anon;

-- ============================================================
-- admin_set_host_status
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_set_host_status(_user_id uuid, _make_host boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _has_approved_face boolean;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _make_host THEN
    SELECT EXISTS (SELECT 1 FROM public.face_verification_submissions
      WHERE user_id = _user_id AND status = 'approved') INTO _has_approved_face;

    IF _has_approved_face THEN
      UPDATE public.profiles
      SET gender = 'female', is_host = true, host_status = 'approved',
          is_face_verified = true, is_verified = true,
          host_level = GREATEST(COALESCE(host_level, 0), 1), updated_at = now()
      WHERE id = _user_id;
    ELSE
      INSERT INTO public.face_verification_submissions
        (user_id, verification_type, status, admin_notes, created_at)
      SELECT _user_id, 'host', 'pending',
        'Created by admin - awaiting face verification upload', now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.face_verification_submissions
        WHERE user_id = _user_id AND status IN ('pending', 'under_review'));
    END IF;
  ELSE
    UPDATE public.profiles
    SET gender = 'male', is_host = false, host_status = NULL,
        is_face_verified = false, is_verified = false,
        host_level = 0, updated_at = now()
    WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_host_status(uuid, boolean) TO authenticated, anon;

-- ============================================================
-- admin_approve_helper: keep auth.uid for approved_by but allow session caller
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_approve_helper(_helper_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE v_admin_id uuid;
BEGIN
  IF NOT public.is_caller_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_admin_id := COALESCE(auth.uid(), public.current_admin_id_from_header());
  UPDATE topup_helpers
    SET is_verified = true, is_active = true,
        approved_at = now(), approved_by = v_admin_id
    WHERE id = _helper_id;
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_approve_helper(uuid) TO authenticated, anon;

-- ============================================================
-- admin_process_helper_transaction
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_process_helper_transaction(_transaction_id uuid, _action text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _txn RECORD;
  v_admin_id uuid;
BEGIN
  IF NOT public.is_caller_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_admin_id := COALESCE(auth.uid(), public.current_admin_id_from_header());
  SELECT * INTO _txn FROM helper_transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF _action = 'approve' AND _txn.transaction_type = 'buy_from_platform' THEN
    UPDATE helper_transactions
       SET status = 'completed', processed_at = now(), processed_by = v_admin_id
     WHERE id = _transaction_id;
    UPDATE topup_helpers
       SET wallet_balance = wallet_balance + _txn.coin_amount,
           total_bought = total_bought + _txn.coin_amount
     WHERE id = _txn.helper_id;
  ELSIF _action = 'reject' THEN
    UPDATE helper_transactions
       SET status = 'failed', processed_at = now(), processed_by = v_admin_id
     WHERE id = _transaction_id;
  END IF;
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_process_helper_transaction(uuid, text) TO authenticated, anon;

-- ============================================================
-- admin_add_violation: auto-resolve admin id from header when needed
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_add_violation(p_admin_id uuid, p_host_id uuid, p_detected_content text, p_detected_pattern text, p_source_type text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_result JSONB;
  v_violation_id UUID;
  v_admin_id UUID;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  v_admin_id := COALESCE(p_admin_id, auth.uid(), public.current_admin_id_from_header());
  v_result := public.process_contact_violation(p_host_id, p_detected_content, p_detected_pattern, p_source_type, NULL);
  v_violation_id := (v_result->>'violation_id')::UUID;
  UPDATE public.host_contact_violations
  SET is_auto_detected = false, is_reviewed = true,
      reviewed_by = v_admin_id, reviewed_at = now(), review_notes = p_notes
  WHERE id = v_violation_id;
  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_add_violation(uuid, uuid, text, text, text, text) TO authenticated, anon;

-- ============================================================
-- admin_process_withdrawal: ADD admin guard (was missing entirely)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _withdrawal RECORD;
  _diamond_reward NUMERIC;
  _platform_fee NUMERIC;
  _net_reward NUMERIC;
  _net_beans NUMERIC;
  _helper_user_id UUID;
  _agency_owner_id UUID;
  _is_payroll_helper BOOLEAN;
  _refund_bucket TEXT;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT aw.* INTO _withdrawal FROM public.agency_withdrawals aw WHERE aw.id = _withdrawal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found'); END IF;
  IF _withdrawal.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition');
  END IF;

  IF _status = 'approved' THEN
    _net_beans := _withdrawal.amount - COALESCE((_withdrawal.payment_details->>'platform_fee')::NUMERIC, ROUND(_withdrawal.amount * 0.05, 0));
    UPDATE public.agency_withdrawals
    SET status = _status, notes = _notes, processed_at = NOW(),
        payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('approved_at', NOW(), 'net_withdrawal_beans', _net_beans)
    WHERE id = _withdrawal_id;

    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _withdrawal.agency_id;
    SELECT EXISTS(SELECT 1 FROM public.topup_helpers th
      WHERE th.user_id = _agency_owner_id AND th.is_verified = true AND th.payroll_enabled = true)
    INTO _is_payroll_helper;

    IF NOT _is_payroll_helper THEN
      UPDATE public.agencies SET commission_rate = 3, level = 'A1', updated_at = NOW()
      WHERE id = _withdrawal.agency_id;
    END IF;

    IF _withdrawal.assigned_helper_id IS NOT NULL AND _net_beans > 0 THEN
      _diamond_reward := _net_beans;
      _platform_fee := ROUND(_diamond_reward * 0.10, 2);
      _net_reward := _diamond_reward - _platform_fee;
      SELECT user_id INTO _helper_user_id FROM public.topup_helpers WHERE id = _withdrawal.assigned_helper_id;
      IF _helper_user_id IS NOT NULL THEN
        UPDATE public.topup_helpers
        SET wallet_balance = COALESCE(wallet_balance, 0) + _net_reward
        WHERE id = _withdrawal.assigned_helper_id;
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (_helper_user_id, 'withdrawal_reward', 'Diamond Reward!',
          'You received ' || ROUND(_net_reward)::TEXT || ' diamonds',
          jsonb_build_object('withdrawal_id', _withdrawal_id, 'net_reward', _net_reward));
      END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal approved');
  ELSE
    UPDATE public.agency_withdrawals
    SET status = _status, notes = _notes, processed_at = NOW()
    WHERE id = _withdrawal_id;

    IF _status = 'rejected' THEN
      _refund_bucket := COALESCE(_withdrawal.payment_details->>'source_balance_bucket', 'wallet_balance');
      IF _refund_bucket = 'beans_balance' THEN
        UPDATE public.agencies
        SET beans_balance = COALESCE(beans_balance, 0) + _withdrawal.amount, updated_at = NOW()
        WHERE id = _withdrawal.agency_id;
      ELSE
        UPDATE public.agencies
        SET wallet_balance = COALESCE(wallet_balance, 0) + _withdrawal.amount, updated_at = NOW()
        WHERE id = _withdrawal.agency_id;
      END IF;

      SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _withdrawal.agency_id;
      IF _agency_owner_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (_agency_owner_id, 'withdrawal_rejected', '❌ Withdrawal Rejected',
          'Your withdrawal of ' || _withdrawal.amount::TEXT || ' beans has been refunded.',
          jsonb_build_object('withdrawal_id', _withdrawal_id, 'amount', _withdrawal.amount,
            'notes', _notes, 'refund_bucket', _refund_bucket));
      END IF;
    END IF;
    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal ' || _status);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_process_withdrawal(uuid, text, text) TO authenticated, anon;

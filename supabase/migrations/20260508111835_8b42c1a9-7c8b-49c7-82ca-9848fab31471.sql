-- Admin RPC token hardening: make admin panel RPCs work with the dedicated x-admin-token session.
-- These functions are called from adminSupabase/custom admin auth, where auth.uid() is usually null.

CREATE OR REPLACE FUNCTION public.admin_add_user_coins(_user_id uuid, _amount integer, _note text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_balance bigint;
  _admin_role text;
  _admin_user_id uuid;
BEGIN
  _admin_user_id := public.current_admin_id_from_header();

  SELECT au.role::text
  INTO _admin_role
  FROM public.admin_users au
  WHERE au.is_active = true
    AND (
      (_admin_user_id IS NOT NULL AND au.id = _admin_user_id)
      OR (_admin_user_id IS NULL AND au.user_id = auth.uid())
    )
  LIMIT 1;

  IF _admin_role IS NULL AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized: Admin access required');
  END IF;

  IF _amount > 10000 AND COALESCE(_admin_role, '') <> 'owner' THEN
    RETURN json_build_object('success', false, 'error', 'Limit exceeded: Only owners can add more than 10,000 coins');
  END IF;

  IF _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _user_id
  RETURNING coins::bigint INTO _new_balance;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  INSERT INTO public.admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    auth.uid(),
    'add_user_coins',
    _user_id::text,
    'user',
    jsonb_build_object(
      'amount', _amount,
      'note', _note,
      'new_balance', _new_balance,
      'admin_role', _admin_role,
      'admin_user_id', _admin_user_id
    )
  );

  RETURN json_build_object('success', true, 'user_id', _user_id, 'amount_added', _amount, 'new_balance', _new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_agency_coins(_agency_id uuid, _amount numeric, _note text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.agencies
  SET wallet_balance = COALESCE(wallet_balance, 0) + _amount
  WHERE id = _agency_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'add_agency_coins',
    'agency',
    _agency_id::text,
    jsonb_build_object('amount', _amount, 'note', _note, 'admin_user_id', public.current_admin_id_from_header())
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_block_agency(_agency_id uuid, _block boolean, _reason text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.agencies
  SET is_blocked = _block,
      blocked_at = CASE WHEN _block THEN now() ELSE NULL END,
      blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
      is_active = NOT _block
  WHERE id = _agency_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN _block THEN 'block_agency' ELSE 'unblock_agency' END,
    'agency',
    _agency_id::text,
    jsonb_build_object('reason', _reason, 'admin_user_id', public.current_admin_id_from_header())
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_agency_level(_agency_id uuid, _level text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.agencies SET level = _level WHERE id = _agency_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'update_agency_level',
    'agency',
    _agency_id::text,
    jsonb_build_object('new_level', _level, 'admin_user_id', public.current_admin_id_from_header())
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_clear_frame_references(frame_id_to_clear uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles SET frame_id = NULL WHERE frame_id = frame_id_to_clear;
  UPDATE public.profiles SET equipped_frame_id = NULL WHERE equipped_frame_id = frame_id_to_clear;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.profiles WHERE id = _user_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'delete_user',
    'user',
    _user_id::text,
    jsonb_build_object('deleted', true, 'admin_user_id', public.current_admin_id_from_header())
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_gift_frame_to_user(
  p_user_id uuid,
  p_frame_id uuid,
  p_source_table text DEFAULT 'avatar_frames'::text,
  p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_notes text DEFAULT 'Gifted by admin'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_assignment_id uuid;
  v_frame_exists boolean;
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_source_table = 'avatar_frames' THEN
    SELECT EXISTS(SELECT 1 FROM public.avatar_frames WHERE id = p_frame_id AND is_active = true)
    INTO v_frame_exists;
  ELSIF p_source_table = 'role_frames' THEN
    SELECT EXISTS(SELECT 1 FROM public.role_frames WHERE id = p_frame_id AND is_active = true)
    INTO v_frame_exists;
  ELSE
    RAISE EXCEPTION 'Invalid source_table: %', p_source_table;
  END IF;

  IF NOT v_frame_exists THEN
    RAISE EXCEPTION 'Frame % not found or inactive in %', p_frame_id, p_source_table;
  END IF;

  SELECT id INTO v_assignment_id
  FROM public.user_role_frames
  WHERE user_id = p_user_id
    AND frame_id = p_frame_id
    AND source_table = p_source_table
  LIMIT 1;

  IF v_assignment_id IS NOT NULL THEN
    UPDATE public.user_role_frames
    SET is_equipped = true,
        expires_at = p_expires_at,
        notes = p_notes,
        assigned_at = now()
    WHERE id = v_assignment_id;
  ELSE
    INSERT INTO public.user_role_frames (user_id, frame_id, source_table, role_type, expires_at, notes)
    VALUES (p_user_id, p_frame_id, p_source_table, 'admin', p_expires_at, p_notes)
    RETURNING id INTO v_assignment_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'assignment_id', v_assignment_id, 'user_id', p_user_id, 'frame_id', p_frame_id, 'source_table', p_source_table);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_gender(_user_id uuid, _gender text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _gender NOT IN ('male', 'female', 'other') THEN
    RAISE EXCEPTION 'Invalid gender value';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET gender = _gender, updated_at = now()
  WHERE id = _user_id;

  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'update_user_gender',
    'profile',
    _user_id::text,
    jsonb_build_object('new_gender', _gender, 'admin_user_id', public.current_admin_id_from_header())
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_face_verification(_user_id uuid, _verified boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _verified THEN
    UPDATE public.profiles
    SET is_verified = true,
        is_face_verified = true,
        face_verified_at = now()
    WHERE id = _user_id;
  ELSE
    UPDATE public.profiles
    SET is_verified = false,
        is_face_verified = false,
        face_verified_at = null,
        face_verification_image = null
    WHERE id = _user_id;

    UPDATE public.face_verification_submissions
    SET status = 'removed', updated_at = now()
    WHERE user_id = _user_id AND status IN ('approved', 'pending');
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_face_verification(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_verified = false,
      is_face_verified = false,
      face_verified_at = null,
      face_verification_image = null,
      is_host = false,
      host_status = null
  WHERE id = _user_id;

  UPDATE public.face_verification_submissions
  SET status = 'removed', updated_at = now()
  WHERE user_id = _user_id AND status IN ('approved', 'pending');

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (_user_id, 'Face Verification Reset', 'Your face verification has been reset. You can now submit a new verification.', 'system');

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_process_face_verification(
  _submission_id uuid,
  _action text,
  _approve_as text DEFAULT 'user'::text,
  _reason text DEFAULT NULL::text,
  _set_gender text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _submission record;
  _gender_value text;
  _face_url text;
  _caller_id uuid;
BEGIN
  _caller_id := COALESCE(public.current_admin_id_from_header(), auth.uid());

  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO _submission FROM public.face_verification_submissions WHERE id = _submission_id;
  IF NOT FOUND THEN RETURN false; END IF;

  _gender_value := COALESCE(_set_gender, CASE WHEN _approve_as = 'host' THEN 'female' ELSE 'male' END);
  _face_url := COALESCE(_submission.face_image_url, _submission.selfie_url);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _action = 'approve' THEN
    UPDATE public.face_verification_submissions
    SET status = 'approved', verification_type = _approve_as, reviewed_by = _caller_id,
        reviewed_at = now(), admin_notes = _reason, updated_at = now()
    WHERE id = _submission_id;

    IF _approve_as = 'host' THEN
      UPDATE public.profiles
      SET is_verified = true,
          is_face_verified = true,
          face_verification_image = _face_url,
          face_verified_at = now(),
          is_host = true,
          host_status = 'approved',
          gender = _gender_value
      WHERE id = _submission.user_id;
    ELSE
      UPDATE public.profiles
      SET is_verified = true,
          is_face_verified = true,
          face_verification_image = _face_url,
          face_verified_at = now(),
          gender = _gender_value
      WHERE id = _submission.user_id;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, type, data)
    VALUES (
      _submission.user_id,
      'Face Verification Approved',
      'Your face verification has been approved.',
      'face_verification_approved',
      jsonb_build_object('submission_id', _submission_id, 'approved_as', _approve_as, 'gender', _gender_value)
    );
  ELSIF _action = 'reject' THEN
    UPDATE public.face_verification_submissions
    SET status = 'rejected', reviewed_by = _caller_id, reviewed_at = now(),
        rejection_reason = _reason, updated_at = now()
    WHERE id = _submission_id;

    UPDATE public.profiles
    SET is_face_verified = false,
        face_verification_image = null,
        face_verified_at = null
    WHERE id = _submission.user_id;

    INSERT INTO public.notifications (user_id, title, message, type, data)
    VALUES (
      _submission.user_id,
      'Face Verification Rejected',
      COALESCE('Reason: ' || _reason, 'Please try again with a clear photo.'),
      'face_verification_rejected',
      jsonb_build_object('submission_id', _submission_id, 'rejection_reason', COALESCE(_reason, ''))
    );
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'process_face_verification',
    'face_verification',
    _submission_id::text,
    jsonb_build_object('action', _action, 'approve_as', _approve_as, 'gender', _gender_value, 'user_id', _submission.user_id, 'reason', _reason, 'admin_user_id', public.current_admin_id_from_header())
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_send_notification(_user_id uuid, _title text, _message text, _type text DEFAULT 'system'::text, _data jsonb DEFAULT NULL::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized: admin access required';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, data, is_read, created_at)
  VALUES (_user_id, _title, _message, _type, _data, false, now())
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_user_coins(uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_add_agency_coins(uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_block_agency(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_agency_level(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_clear_frame_references(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_gift_frame_to_user(uuid, uuid, text, timestamp with time zone, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_user_gender(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_toggle_face_verification(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_remove_face_verification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_process_face_verification(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_send_notification(uuid, text, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_add_user_coins(uuid, integer, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_agency_coins(uuid, numeric, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_block_agency(uuid, boolean, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_agency_level(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_frame_references(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_gift_frame_to_user(uuid, uuid, text, timestamp with time zone, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_gender(uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_face_verification(uuid, boolean) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_face_verification(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_face_verification(uuid, text, text, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_send_notification(uuid, text, text, text, jsonb) TO authenticated, anon;

-- Existing no-arg agency stats function is token-gated and used by /admin/agency-hub.
GRANT EXECUTE ON FUNCTION public.admin_agency_overview_stats() TO authenticated, anon;
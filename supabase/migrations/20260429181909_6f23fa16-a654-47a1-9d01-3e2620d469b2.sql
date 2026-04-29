-- =============================================================
-- CRITICAL FIX: Admin panel uses token-header auth (x-admin-token),
-- NOT auth.uid(). Replace is_admin(auth.uid()) with
-- is_active_admin_session() so admin RPCs actually authorize.
-- =============================================================

-- 1. admin_change_user_role
CREATE OR REPLACE FUNCTION public.admin_change_user_role(_user_id uuid, _new_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_active_admin_session() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _new_role NOT IN ('host', 'user') THEN RAISE EXCEPTION 'Invalid role value'; END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _new_role = 'host' THEN
    UPDATE profiles SET is_host = true, host_status = 'approved', updated_at = now() WHERE id = _user_id;
  ELSE
    UPDATE profiles SET is_host = false, host_status = NULL, updated_at = now() WHERE id = _user_id;
  END IF;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  PERFORM public.log_admin_action('change_user_role', 'profile', _user_id, jsonb_build_object('new_role', _new_role));
  RETURN TRUE;
END;
$function$;

-- 2. admin_create_agency
CREATE OR REPLACE FUNCTION public.admin_create_agency(_name text, _agency_code text, _owner_id uuid, _level text DEFAULT 'A1'::text, _commission_rate numeric DEFAULT 2)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_agency_id uuid;
BEGIN
  IF NOT public.is_active_admin_session() THEN RAISE EXCEPTION 'Only admins can create agencies'; END IF;

  INSERT INTO agencies (name, agency_code, owner_id, level, commission_rate, is_active, is_blocked, total_hosts, total_agents, wallet_balance)
  VALUES (_name, _agency_code, _owner_id, _level, _commission_rate, true, false, 0, 0, 0)
  RETURNING id INTO new_agency_id;

  IF _owner_id IS NOT NULL THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles SET is_agency_owner = true WHERE id = _owner_id;
  END IF;
  RETURN new_agency_id;
END;
$function$;

-- 3. admin_credit_beans
CREATE OR REPLACE FUNCTION public.admin_credit_beans(_log_id uuid, _notes text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _log_record RECORD;
  _receiver_profile RECORD;
  _new_pending BIGINT;
  _new_earnings BIGINT;
BEGIN
  IF NOT public.is_active_admin_session() THEN
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

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles SET pending_earnings = _new_pending, total_earnings = _new_earnings WHERE id = _log_record.receiver_id;
  UPDATE gift_transaction_logs SET status = 'manual_credit', credited_at = now(), credited_by = auth.uid(), notes = COALESCE(_notes, 'Manually credited by admin'), updated_at = now() WHERE id = _log_id;
  PERFORM public.log_admin_action('manual_credit_beans', 'gift_transaction_logs', _log_id::text, jsonb_build_object('receiver_id', _log_record.receiver_id, 'beans_amount', _log_record.beans_amount, 'previous_pending', _receiver_profile.pending_earnings, 'new_pending', _new_pending, 'notes', _notes));
  RETURN json_build_object('success', true, 'beans_credited', _log_record.beans_amount, 'new_pending', _new_pending, 'new_earnings', _new_earnings);
END;
$function$;

-- 4. admin_permanent_ban_step_three (owner-only)
CREATE OR REPLACE FUNCTION public.admin_permanent_ban_step_three(_case_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_case public.admin_permanent_ban_cases%ROWTYPE;
  v_target RECORD;
  v_affected UUID[] := ARRAY[]::UUID[];
  v_summary JSONB;
BEGIN
  IF NOT public.is_active_owner_session() THEN
    RAISE EXCEPTION 'Only owners can execute permanent ban step 3';
  END IF;
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
    SET is_active = false, unbanned_by = auth.uid(), unbanned_at = now(),
        unban_reason = CONCAT('Superseded by permanent ban case ', _case_id::TEXT)
    WHERE user_id = v_target.user_id AND is_active = true;

    INSERT INTO public.live_bans (
      user_id, banned_by, reason, ban_type, ban_duration_hours, expires_at,
      is_active, ban_reason, violation_type, warning_count, ban_start, ban_end, auto_banned)
    VALUES (
      v_target.user_id, auth.uid(), v_case.reason, 'permanent', NULL, NULL, true,
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
  SET status = 'step3_executed', executed_by = auth.uid(), executed_at = now(), execution_summary = v_summary
  WHERE id = _case_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), 'permanent_ban_step3_executed', 'profile', v_case.target_user_id::TEXT,
          jsonb_build_object('case_id', _case_id, 'summary', v_summary));
  RETURN v_summary;
END;
$function$;

-- 5. admin_process_host_application
CREATE OR REPLACE FUNCTION public.admin_process_host_application(_application_id uuid, _status text, _processed_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _application RECORD;
    _user_id uuid;
BEGIN
    IF NOT public.is_active_admin_session() THEN
        RAISE EXCEPTION 'Unauthorized: Admin access required.';
    END IF;

    SELECT * INTO _application FROM host_applications WHERE id = _application_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Application not found');
    END IF;

    _user_id := _application.user_id;

    UPDATE host_applications
    SET status = _status, updated_at = now()
    WHERE id = _application_id;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    IF _status = 'approved' THEN
        UPDATE profiles
        SET is_host = true, host_status = 'approved', is_face_verified = true, updated_at = now()
        WHERE id = _user_id;

        INSERT INTO notifications (user_id, type, title, message)
        VALUES (_user_id, 'host_approved', 'Congratulations!', 'Your host application has been approved. You can now start earning!');

    ELSIF _status = 'rejected' THEN
        UPDATE profiles
        SET host_status = 'rejected', updated_at = now()
        WHERE id = _user_id;

        INSERT INTO notifications (user_id, type, title, message)
        VALUES (_user_id, 'host_rejected', 'Application Rejected', 'Sorry, your host application was not approved at this time.');
    END IF;

    PERFORM log_admin_action('process_host_application', 'host_application', _application_id,
        jsonb_build_object('status', _status, 'user_id', _user_id));

    RETURN jsonb_build_object('success', true, 'status', _status);
END;
$function$;

-- 6. admin_remove_host_from_agency
CREATE OR REPLACE FUNCTION public.admin_remove_host_from_agency(_host_id uuid, _reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _agency_id UUID;
BEGIN
  IF NOT public.is_active_admin_session() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT agency_id INTO _agency_id FROM agency_hosts WHERE host_id = _host_id AND status = 'active';
  IF _agency_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE agency_hosts SET status = 'removed', left_at = now() WHERE host_id = _host_id AND agency_id = _agency_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET agency_id = NULL WHERE id = _host_id;

  UPDATE agencies SET total_hosts = GREATEST(total_hosts - 1, 0) WHERE id = _agency_id;
  PERFORM public.log_admin_action('remove_host_from_agency', 'host', _host_id, jsonb_build_object('agency_id', _agency_id, 'reason', _reason));
  RETURN TRUE;
END;
$function$;
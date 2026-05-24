-- Section #10 pass-4 retry: Agency / Host Applications hardening

DROP POLICY IF EXISTS "Users can join agencies" ON public.agency_hosts;
DROP POLICY IF EXISTS "owner_insert_agency_hosts" ON public.agency_hosts;
DROP POLICY IF EXISTS "Hosts can cancel their own pending requests" ON public.agency_hosts;
DROP POLICY IF EXISTS "owner_update_agency_hosts" ON public.agency_hosts;
DROP POLICY IF EXISTS "No direct agency host inserts" ON public.agency_hosts;
DROP POLICY IF EXISTS "No direct agency host updates" ON public.agency_hosts;
DROP POLICY IF EXISTS "No direct agency host deletes" ON public.agency_hosts;

CREATE POLICY "No direct agency host inserts" ON public.agency_hosts FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct agency host updates" ON public.agency_hosts FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No direct agency host deletes" ON public.agency_hosts FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "Agency owners can insert transactions" ON public.agency_diamond_transactions;
DROP POLICY IF EXISTS "No direct agency diamond inserts" ON public.agency_diamond_transactions;
CREATE POLICY "No direct agency diamond inserts" ON public.agency_diamond_transactions FOR INSERT TO authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.join_agency(_host_id uuid, _agency_code text, _joined_via text DEFAULT 'code'::text, _referral_code text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_id uuid; v_agency_name text; v_owner_id uuid; v_existing_id uuid; v_existing_status text;
  v_referral_code text; v_sub_agent_agency uuid; v_caller uuid := auth.uid();
  v_jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_joined_via text := left(COALESCE(NULLIF(trim(_joined_via), ''), 'code'), 40);
BEGIN
  IF v_jwt_role <> 'service_role' AND NOT public.is_active_admin_session() AND v_caller IS DISTINCT FROM _host_id THEN
    RAISE EXCEPTION 'Not authorized to join agency for another user';
  END IF;
  IF _host_id IS NULL OR trim(COALESCE(_agency_code, '')) = '' THEN RAISE EXCEPTION 'Invalid agency join request'; END IF;

  SELECT id, name, owner_id INTO v_agency_id, v_agency_name, v_owner_id
  FROM public.agencies
  WHERE upper(agency_code) = upper(trim(_agency_code)) AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false
  LIMIT 1;
  IF v_agency_id IS NULL THEN RAISE EXCEPTION 'Agency not found or inactive'; END IF;
  IF v_owner_id = _host_id THEN RAISE EXCEPTION 'Agency owner cannot join their own agency as host'; END IF;

  v_referral_code := NULLIF(upper(trim(COALESCE(_referral_code, ''))), '');
  IF v_referral_code IS NOT NULL THEN
    SELECT agency_id INTO v_sub_agent_agency FROM public.sub_agents WHERE referral_code = v_referral_code AND status = 'active' LIMIT 1;
    IF v_sub_agent_agency IS DISTINCT FROM v_agency_id THEN v_referral_code := NULL; END IF;
  END IF;

  SELECT id, status INTO v_existing_id, v_existing_status FROM public.agency_hosts WHERE host_id = _host_id ORDER BY joined_at DESC NULLS LAST, id DESC LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_status = 'active' THEN RAISE EXCEPTION 'Already a member of an agency'; END IF;
    IF v_existing_status = 'pending' AND EXISTS (SELECT 1 FROM public.agency_hosts WHERE host_id = _host_id AND agency_id = v_agency_id AND status = 'pending') THEN
      RAISE EXCEPTION 'Join request already pending';
    END IF;
    DELETE FROM public.agency_hosts WHERE host_id = _host_id AND status IN ('rejected', 'left', 'removed', 'pending');
    UPDATE public.agency_host_requests SET status = 'cancelled', updated_at = now() WHERE host_id = _host_id AND status = 'pending';
  END IF;

  INSERT INTO public.agency_hosts (host_id, agency_id, status, joined_via, joined_at, referral_code)
  VALUES (_host_id, v_agency_id, 'pending', v_joined_via, now(), v_referral_code);

  INSERT INTO public.agency_host_requests (agency_id, host_id, status, created_at, updated_at)
  VALUES (v_agency_id, _host_id, 'pending', now(), now())
  ON CONFLICT (agency_id, host_id) WHERE status = 'pending' DO UPDATE SET updated_at = excluded.updated_at;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (v_owner_id, 'agency_host_request', '🔔 New Host Join Request', 'A host wants to join ' || COALESCE(v_agency_name, 'your agency') || '. Tap to approve or reject.', jsonb_build_object('agency_id', v_agency_id, 'host_id', _host_id, 'action_url', '/agency-host-management'), false, now());
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_host_request(_agency_id uuid, _host_id uuid, _rejector_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_owner_id uuid; v_agency_name text; v_updated int := 0;
BEGIN
  SELECT owner_id, name INTO v_owner_id, v_agency_name FROM public.agencies WHERE id = _agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false;
  IF v_owner_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Agency not found'); END IF;
  IF NOT (v_jwt_role = 'service_role' OR public.is_active_admin_session() OR (v_caller IS NOT NULL AND v_caller = v_owner_id AND _rejector_id = v_caller)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  UPDATE public.agency_hosts SET status = 'rejected', left_at = now() WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Request not found'); END IF;
  UPDATE public.agency_host_requests SET status = 'rejected', updated_at = now() WHERE agency_id = _agency_id AND host_id = _host_id AND status = 'pending';
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (_host_id, 'agency_host_rejected', '❌ Agency Request Rejected', 'Your request to join ' || COALESCE(v_agency_name, 'the agency') || ' was declined.', jsonb_build_object('agency_id', _agency_id, 'agency_name', v_agency_name, 'action_url', '/agency'), false, now());
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_user(_agency_id uuid, _receiver_id uuid, _amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_agency_owner_id uuid; v_current_balance bigint; v_new_user_balance bigint; v_agency_name text;
BEGIN
  PERFORM set_config('app.calling_function', 'agency_send_diamonds_to_user', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  IF v_caller IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized'); END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive'); END IF;
  IF v_caller = _receiver_id THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to yourself'); END IF;
  SELECT owner_id, diamond_balance, name INTO v_agency_owner_id, v_current_balance, v_agency_name FROM public.agencies WHERE id = _agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false FOR UPDATE;
  IF v_agency_owner_id IS NULL OR v_agency_owner_id <> v_caller THEN RETURN jsonb_build_object('success', false, 'error', 'Not agency owner'); END IF;
  v_current_balance := COALESCE(v_current_balance, 0);
  IF _amount > v_current_balance THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance'); END IF;
  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
  UPDATE public.agencies SET diamond_balance = COALESCE(diamond_balance, 0) - _amount, updated_at = now() WHERE id = _agency_id;
  UPDATE public.profiles SET coins = COALESCE(coins, 0) + _amount WHERE id = _receiver_id RETURNING coins INTO v_new_user_balance;
  IF v_new_user_balance IS NULL THEN RAISE EXCEPTION 'Receiver not found'; END IF;
  INSERT INTO public.agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id) VALUES (_agency_id, 'send', 0, _amount, 0, _receiver_id);
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (_receiver_id, 'coins_received', 'Diamonds Received', _amount::text || ' diamonds received from ' || COALESCE(v_agency_name, 'Agency'), jsonb_build_object('agency_id', _agency_id, 'agency_name', v_agency_name, 'amount', _amount, 'action_url', '/recharge-history'), false, now());
  RETURN jsonb_build_object('success', true, 'new_agency_balance', v_current_balance - _amount, 'new_receiver_coins', v_new_user_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agency_send_diamonds_to_agency(_sender_agency_id uuid, _target_agency_id uuid, _amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_sender_owner_id uuid; v_target_owner_id uuid; v_sender_balance bigint; v_new_target_balance bigint; v_sender_agency_name text;
BEGIN
  PERFORM set_config('app.calling_function', 'agency_send_diamonds_to_agency', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  IF v_caller IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized'); END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive'); END IF;
  IF _sender_agency_id = _target_agency_id THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to the same agency'); END IF;
  SELECT owner_id, diamond_balance, name INTO v_sender_owner_id, v_sender_balance, v_sender_agency_name FROM public.agencies WHERE id = _sender_agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false FOR UPDATE;
  IF v_sender_owner_id IS NULL OR v_sender_owner_id <> v_caller THEN RETURN jsonb_build_object('success', false, 'error', 'Not agency owner'); END IF;
  SELECT owner_id INTO v_target_owner_id FROM public.agencies WHERE id = _target_agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false FOR UPDATE;
  IF v_target_owner_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Target agency not found'); END IF;
  IF v_target_owner_id = v_caller THEN RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to your own agency'); END IF;
  v_sender_balance := COALESCE(v_sender_balance, 0);
  IF _amount > v_sender_balance THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamond balance'); END IF;
  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
  UPDATE public.agencies SET diamond_balance = COALESCE(diamond_balance, 0) - _amount, updated_at = now() WHERE id = _sender_agency_id;
  UPDATE public.agencies SET diamond_balance = COALESCE(diamond_balance, 0) + _amount, updated_at = now() WHERE id = _target_agency_id RETURNING diamond_balance INTO v_new_target_balance;
  INSERT INTO public.agency_diamond_transactions (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount, user_id) VALUES (_sender_agency_id, 'send_agency', 0, _amount, 0, v_target_owner_id);
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (v_target_owner_id, 'agency_diamond_received', 'Agency Diamonds Received', _amount::text || ' diamonds received from ' || COALESCE(v_sender_agency_name, 'Agency'), jsonb_build_object('from_agency_id', _sender_agency_id, 'from_agency_name', v_sender_agency_name, 'target_agency_id', _target_agency_id, 'amount', _amount, 'action_url', '/agency-dashboard'), false, now());
  RETURN jsonb_build_object('success', true, 'new_sender_balance', v_sender_balance - _amount, 'new_target_balance', v_new_target_balance, 'target_agency_id', _target_agency_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_agency_to_parent(_child_agency_id uuid, _parent_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid(); v_child_owner uuid; v_existing_parent uuid; v_parent_exists boolean; v_parent_count int;
BEGIN
  IF _child_agency_id IS NULL OR _parent_agency_id IS NULL OR _child_agency_id = _parent_agency_id THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid agency link'); END IF;
  SELECT owner_id, parent_agency_id INTO v_child_owner, v_existing_parent FROM public.agencies WHERE id = _child_agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false FOR UPDATE;
  IF v_child_owner IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Child agency not found'); END IF;
  IF NOT (public.is_active_admin_session() OR (v_caller IS NOT NULL AND (v_caller = v_child_owner OR public.is_admin(v_caller)))) THEN RETURN jsonb_build_object('success', false, 'error', 'Unauthorized'); END IF;
  IF v_existing_parent IS NOT NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Agency already has a parent'); END IF;
  SELECT EXISTS (SELECT 1 FROM public.agencies WHERE id = _parent_agency_id AND COALESCE(is_active, true) = true AND COALESCE(is_blocked, false) = false) INTO v_parent_exists;
  IF NOT v_parent_exists THEN RETURN jsonb_build_object('success', false, 'error', 'Parent agency not found'); END IF;
  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
  UPDATE public.agencies SET parent_agency_id = _parent_agency_id, updated_at = now() WHERE id = _child_agency_id;
  SELECT count(*)::int INTO v_parent_count FROM public.agencies WHERE parent_agency_id = _parent_agency_id AND COALESCE(is_active, true) = true;
  UPDATE public.agencies SET total_agents = v_parent_count, updated_at = now() WHERE id = _parent_agency_id;
  RETURN jsonb_build_object('success', true, 'parent_agency_id', _parent_agency_id, 'total_agents', v_parent_count);
END;
$function$;

CREATE OR REPLACE VIEW public.agencies_public AS
SELECT id, name, agency_code, logo_url, level, total_hosts, total_agents, is_active, parent_agency_id, owner_id, created_at, NULL::bigint AS diamond_balance
FROM public.agencies
WHERE COALESCE(is_active, true) = true;

REVOKE ALL ON FUNCTION public.join_agency(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_agency(uuid, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_agency_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_agency_request(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_host_agency_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_host_agency_request(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_host_request(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_host_request(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_host_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_host_request(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_host_request(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_host_request(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_sub_agent(uuid, uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sub_agent(uuid, uuid, text, numeric) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.link_agency_to_parent(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_agency_to_parent(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.agency_send_diamonds_to_user(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_send_diamonds_to_user(uuid, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.agency_send_diamonds_to_agency(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_send_diamonds_to_agency(uuid, uuid, integer) TO authenticated, service_role;
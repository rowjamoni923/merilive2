-- Pkg365: secure admin helper + punishment actions for shared admin section
-- Fixes direct protected-table writes found during manual re-audit.

CREATE OR REPLACE FUNCTION public.admin_upsert_topup_helper(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_helper_id uuid;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['topup-system','finance-hub','manual-topup','user-management'], true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Topup/finance permission required');
  END IF;
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing user id');
  END IF;
  IF public._is_target_user_owner(_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change owner account helper status');
  END IF;

  INSERT INTO public.topup_helpers (user_id, is_active, is_verified, approved_at, approved_by, updated_at)
  VALUES (_user_id, true, true, now(), v_admin_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET is_active = true,
        is_verified = true,
        approved_at = COALESCE(public.topup_helpers.approved_at, now()),
        approved_by = COALESCE(public.topup_helpers.approved_by, v_admin_id),
        updated_at = now()
  RETURNING id INTO v_helper_id;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_admin_id, 'topup_helper_upsert', 'topup_helper', v_helper_id, jsonb_build_object('user_id', _user_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'helper_id', v_helper_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_topup_helper_active(_helper_id uuid, _active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_helper record;
  v_agency record;
  v_tier_rate numeric;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['topup-system','finance-hub','manual-topup','user-management'], true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Topup/finance permission required');
  END IF;
  IF _helper_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing helper id');
  END IF;

  SELECT * INTO v_helper FROM public.topup_helpers WHERE id = _helper_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found');
  END IF;
  IF public._is_target_user_owner(v_helper.user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot change owner account helper status');
  END IF;

  UPDATE public.topup_helpers
     SET is_active = COALESCE(_active, false), updated_at = now()
   WHERE id = _helper_id;

  IF COALESCE(v_helper.trader_level, 0) = 5 AND COALESCE(v_helper.payroll_enabled, false) THEN
    SELECT * INTO v_agency FROM public.agencies WHERE owner_id = v_helper.user_id LIMIT 1;
    IF FOUND THEN
      IF COALESCE(_active, false) THEN
        v_tier_rate := 12;
      ELSE
        SELECT commission_rate INTO v_tier_rate
        FROM public.agency_level_tiers
        WHERE level_code = COALESCE(
          (CASE v_agency.level
            WHEN 'A1' THEN 'bronze'
            WHEN 'A2' THEN 'silver'
            WHEN 'A3' THEN 'gold'
            WHEN 'A4' THEN 'platinum'
            WHEN 'A5' THEN 'diamond'
            ELSE v_agency.level
          END),
          'bronze'
        )
        AND is_active = true
        LIMIT 1;
        v_tier_rate := COALESCE(v_tier_rate, 3);
      END IF;

      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.agencies
         SET commission_rate = v_tier_rate, updated_at = now()
       WHERE id = v_agency.id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_admin_id, CASE WHEN COALESCE(_active,false) THEN 'topup_helper_activated' ELSE 'topup_helper_deactivated' END, 'topup_helper', _helper_id, jsonb_build_object('user_id', v_helper.user_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'is_active', COALESCE(_active, false));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_record_helper_transaction_decision(_transaction_id uuid, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_txn record;
  v_amount bigint;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['topup-system','finance-hub','manual-topup'], true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Topup/finance permission required');
  END IF;
  IF _action NOT IN ('approve','reject') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action');
  END IF;

  SELECT * INTO v_txn FROM public.helper_transactions WHERE id = _transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  v_amount := COALESCE(v_txn.amount, 0);

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_admin_id, 'helper_transaction_' || _action, 'helper_transaction', _transaction_id,
            jsonb_build_object('helper_id', v_txn.helper_id, 'amount', v_amount, 'transaction_type', v_txn.transaction_type));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'ledger_only', true, 'message', 'Transaction recorded as ledger-only; no balance mutation was applied');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_chat_punishment(
  _user_id uuid,
  _punishment_type text,
  _reason text DEFAULT NULL,
  _duration_hours integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_device_id text;
  v_live_ban_end timestamptz;
  v_violation_type text;
  v_duration integer;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(ARRAY['moderation','user-management','all-hosts'], true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Moderation permission required');
  END IF;
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing user id');
  END IF;
  IF public._is_target_user_owner(_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot punish owner account');
  END IF;
  IF _punishment_type NOT IN ('urgent','medium','normal') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid punishment type');
  END IF;

  IF _punishment_type IN ('urgent','medium') THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET is_host = false,
           gender = 'male',
           host_status = NULL,
           is_face_verified = false,
           is_verified = false,
           user_level = 0,
           host_level = 0,
           is_blocked = true,
           blocked_reason = COALESCE(_reason, CASE WHEN _punishment_type='urgent' THEN 'Urgent Ban' ELSE 'Medium Ban' END),
           blocked_at = now(),
           updated_at = now()
     WHERE id = _user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    UPDATE public.live_streams SET is_active = false, ended_at = now()
    WHERE host_id = _user_id AND is_active = true;
  END IF;

  IF _punishment_type = 'urgent' THEN
    SELECT device_id INTO v_device_id FROM public.profiles WHERE id = _user_id;
    IF v_device_id IS NOT NULL AND v_device_id <> '' THEN
      INSERT INTO public.banned_devices (device_id, user_id, reason, banned_by, is_permanent, is_active)
      VALUES (v_device_id, _user_id, COALESCE(_reason, 'Urgent Ban - Device permanently banned'), v_admin_id, true, true)
      ON CONFLICT (device_id) DO UPDATE
        SET is_active = true,
            is_permanent = true,
            reason = EXCLUDED.reason,
            user_id = EXCLUDED.user_id,
            banned_by = EXCLUDED.banned_by,
            updated_at = now();
    END IF;
  END IF;

  IF _punishment_type = 'normal' THEN
    v_duration := GREATEST(COALESCE(_duration_hours, 0), 1);
    v_live_ban_end := now() + make_interval(hours => v_duration);
    v_violation_type := 'normal_ban';
  ELSE
    v_duration := NULL;
    v_live_ban_end := NULL;
    v_violation_type := CASE WHEN _punishment_type='urgent' THEN 'urgent_ban' ELSE 'medium_ban' END;
  END IF;

  INSERT INTO public.live_bans (user_id, ban_reason, violation_type, ban_duration_hours, ban_end, is_active, auto_banned)
  VALUES (_user_id, COALESCE(_reason, v_violation_type), v_violation_type, v_duration, v_live_ban_end, true, false);

  INSERT INTO public.admin_notifications (type, title, message, priority, data)
  VALUES (
    _punishment_type || '_ban',
    CASE WHEN _punishment_type='urgent' THEN '🚨 URGENT BAN Applied'
         WHEN _punishment_type='medium' THEN '🚫 Medium Ban Applied'
         ELSE '⏱️ Normal Ban Applied' END,
    COALESCE(_reason, 'Admin punishment applied'),
    CASE WHEN _punishment_type='urgent' THEN 'critical' WHEN _punishment_type='medium' THEN 'high' ELSE 'normal' END,
    jsonb_build_object('user_id', _user_id, 'ban_type', _punishment_type)
  );

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_admin_id, 'chat_punishment_' || _punishment_type, 'user', _user_id,
            jsonb_build_object('reason', _reason, 'duration_hours', v_duration));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('success', true, 'punishment_type', _punishment_type, 'duration_hours', v_duration);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_topup_helper(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_topup_helper_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_record_helper_transaction_decision(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_apply_chat_punishment(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_topup_helper(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_topup_helper_active(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_helper_transaction_decision(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_chat_punishment(uuid, text, text, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_upsert_topup_helper(uuid) IS 'Pkg365: secure admin helper/trader creation or reactivation; replaces direct topup_helpers insert from admin pages.';
COMMENT ON FUNCTION public.admin_set_topup_helper_active(uuid, boolean) IS 'Pkg365: secure admin helper/trader activation toggle with L5 agency commission sync; replaces direct topup_helpers/agencies updates.';
COMMENT ON FUNCTION public.admin_record_helper_transaction_decision(uuid, text) IS 'Pkg365: admin-safe helper transaction decision; production helper_transactions is ledger-only, so this function audit-logs without double-crediting.';
COMMENT ON FUNCTION public.admin_apply_chat_punishment(uuid, text, text, integer) IS 'Pkg365: secure chat moderation punishment path; replaces direct protected profiles updates for urgent/medium/normal bans.';
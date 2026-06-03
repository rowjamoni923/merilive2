
-- ============================================================================
-- Pkg343 Helpers/Traders deep-audit lockdown
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART 1: RPC section-permission gates (5 RPCs)
-- ---------------------------------------------------------------------------

-- 1.1 admin_approve_helper — was only is_caller_admin()
CREATE OR REPLACE FUNCTION public.admin_approve_helper(_helper_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_admin_id uuid;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated as admin';
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','helper-management','level-5-helpers','topup-system','manual-topup','user-management'], true
  ) THEN
    RAISE EXCEPTION 'Helper/finance permission required to approve helper';
  END IF;
  v_admin_id := COALESCE(auth.uid(), public.current_admin_id_from_header());
  UPDATE topup_helpers
    SET is_verified = true, is_active = true,
        approved_at = now(), approved_by = v_admin_id
    WHERE id = _helper_id;
  RETURN TRUE;
END;
$function$;

-- 1.2 admin_approve_helper_topup — was only is_active_admin_session()
CREATE OR REPLACE FUNCTION public.admin_approve_helper_topup(_request_id uuid, _amount_usd numeric DEFAULT NULL::numeric, _admin_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _req RECORD; _rate_cfg jsonb; _usd_per_100k numeric; _amount numeric; _diamonds bigint; _admin_id uuid;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','topup-system','manual-topup','helper-management','level-5-helpers'], true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Topup/finance permission required');
  END IF;

  SELECT CASE WHEN jsonb_typeof(setting_value::jsonb) = 'object' THEN setting_value::jsonb ELSE NULL END
    INTO _rate_cfg FROM public.app_settings WHERE setting_key = 'trader_wallet_topup_rate';
  _usd_per_100k := NULLIF((_rate_cfg->>'usd_per_100k_diamonds'),'')::numeric;
  IF _usd_per_100k IS NULL OR _usd_per_100k <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'trader_wallet_topup_rate not configured. Set "usd_per_100k_diamonds" in Pricing Hub → Helper.');
  END IF;

  SELECT * INTO _req FROM public.helper_topup_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Request not found'); END IF;
  IF _req.status IS DISTINCT FROM 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'Already processed'); END IF;

  _amount := COALESCE(_amount_usd, _req.amount_usd);
  IF _amount IS NULL OR _amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid USD amount'); END IF;
  _diamonds := floor(_amount * 100000.0 / _usd_per_100k)::bigint;
  IF _diamonds <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Computed diamonds <= 0; check rate or USD amount'); END IF;

  _admin_id := COALESCE(_req.processed_by, public.current_admin_id_from_header(), auth.uid());

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.topup_helpers
     SET wallet_balance = COALESCE(wallet_balance, 0) + _diamonds,
         total_bought   = COALESCE(total_bought,   0) + _diamonds,
         updated_at     = now()
   WHERE id = _req.helper_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  UPDATE public.helper_topup_requests
     SET status = 'approved', amount_usd = _amount, coin_amount = _diamonds,
         admin_notes = COALESCE(_admin_notes, admin_notes),
         processed_at = now(), processed_by = _admin_id
   WHERE id = _request_id;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT h.user_id, 'topup_approved', '💎 Trader Wallet Topped Up!',
         'Your manual top-up of $' || _amount || ' has been approved. ' || _diamonds::text || ' diamonds added to your Trader Wallet.',
         jsonb_build_object('diamonds', _diamonds, 'amount_usd', _amount, 'rate_usd_per_100k', _usd_per_100k, 'request_id', _request_id)
    FROM public.topup_helpers h WHERE h.id = _req.helper_id;

  RETURN jsonb_build_object('success', true, 'request_id', _request_id, 'diamonds', _diamonds, 'amount_usd', _amount, 'rate_usd_per_100k', _usd_per_100k);
END;
$function$;

-- 1.3 admin_process_helper_transaction — was only is_caller_admin()
CREATE OR REPLACE FUNCTION public.admin_process_helper_transaction(_transaction_id uuid, _action text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _txn RECORD; v_admin_id uuid;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated as admin';
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','topup-system','manual-topup','helper-management','level-5-helpers'], true
  ) THEN
    RAISE EXCEPTION 'Topup/finance permission required';
  END IF;
  v_admin_id := COALESCE(auth.uid(), public.current_admin_id_from_header());
  SELECT * INTO _txn FROM helper_transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF _action = 'approve' AND _txn.transaction_type = 'buy_from_platform' THEN
    UPDATE helper_transactions SET status = 'completed', processed_at = now(), processed_by = v_admin_id WHERE id = _transaction_id;
    UPDATE topup_helpers SET wallet_balance = wallet_balance + _txn.coin_amount, total_bought = total_bought + _txn.coin_amount WHERE id = _txn.helper_id;
  ELSIF _action = 'reject' THEN
    UPDATE helper_transactions SET status = 'failed', processed_at = now(), processed_by = v_admin_id WHERE id = _transaction_id;
  END IF;
  RETURN TRUE;
END;
$function$;

-- 1.4 admin_set_topup_trader_approval — was only is_active_admin_session()
CREATE OR REPLACE FUNCTION public.admin_set_topup_trader_approval(_helper_id uuid, _approve boolean, _trader_level integer DEFAULT NULL::integer, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE h RECORD; new_lvl int; new_verified boolean; new_active boolean; admin_id uuid; admin_name text;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','helper-management','level-5-helpers','topup-system','manual-topup','user-management'], true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper/finance permission required');
  END IF;

  SELECT id, user_id, is_verified, is_active, trader_level INTO h FROM public.topup_helpers WHERE id = _helper_id FOR UPDATE;
  IF h.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Helper not found'); END IF;

  IF _approve THEN
    new_lvl := COALESCE(NULLIF(_trader_level, 0), NULLIF(h.trader_level, 0), 1);
    IF new_lvl < 1 OR new_lvl > 5 THEN RETURN jsonb_build_object('success', false, 'error', 'trader_level must be 1-5'); END IF;
    new_verified := true; new_active := true;
  ELSE
    new_lvl := h.trader_level; new_verified := false; new_active := COALESCE(h.is_active, true);
  END IF;

  UPDATE public.topup_helpers SET is_verified = new_verified, is_active = new_active, trader_level = new_lvl, updated_at = now() WHERE id = _helper_id;

  BEGIN admin_id := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN admin_id := NULL; END;
  admin_id := COALESCE(admin_id, public.current_admin_id_from_header());
  admin_name := NULLIF(current_setting('request.headers.x-admin-username', true), '');

  INSERT INTO public.topup_trader_approval_log(
    helper_id, user_id, action,
    previous_is_verified, previous_is_active, previous_trader_level,
    new_is_verified, new_is_active, new_trader_level,
    reason, performed_by, performed_by_name
  ) VALUES (
    _helper_id, h.user_id, CASE WHEN _approve THEN 'approve' ELSE 'revoke' END,
    h.is_verified, h.is_active, h.trader_level,
    new_verified, new_active, new_lvl,
    _reason, admin_id, admin_name
  );

  RETURN jsonb_build_object('success', true, 'helper_id', _helper_id, 'is_verified', new_verified, 'is_active', new_active, 'trader_level', new_lvl);
END; $function$;

-- 1.5 assign_payroll_to_trader — was only is_admin OR is_active_admin_session
CREATE OR REPLACE FUNCTION public.assign_payroll_to_trader(_withdrawal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal RECORD; v_helper RECORD; v_amount bigint; v_country text;
  v_balance_before bigint; v_balance_after bigint; v_admin_id uuid; v_helper_label text;
BEGIN
  IF public.current_admin_id_from_header() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;
  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','withdrawals','agency-management','level-5-helpers','helper-management'], true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal/helper permission required');
  END IF;

  SELECT * INTO v_withdrawal FROM public.agency_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found'); END IF;
  IF v_withdrawal.status <> 'pending' OR v_withdrawal.assigned_helper_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is not available for assignment');
  END IF;
  v_amount := FLOOR(COALESCE(v_withdrawal.amount, 0))::bigint;
  IF v_amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid withdrawal amount'); END IF;
  v_country := COALESCE(NULLIF(v_withdrawal.country_code, ''), NULLIF(v_withdrawal.payment_details->>'country_code', ''));
  IF v_country IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Withdrawal country is missing'); END IF;

  SELECT th.*, COALESCE(NULLIF(p.display_name, ''), p.app_uid, 'Level 5 Helper') AS helper_label
  INTO v_helper
  FROM public.topup_helpers th
  LEFT JOIN public.profiles p ON p.id = th.user_id
  WHERE th.is_verified = true AND th.is_active = true AND th.payroll_enabled = true
    AND th.trader_level = 5 AND th.country_code = v_country
    AND COALESCE(th.wallet_balance, 0) >= v_amount
  ORDER BY th.wallet_balance DESC, th.updated_at ASC NULLS LAST
  LIMIT 1 FOR UPDATE OF th;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'No eligible Level 5 payroll helper found'); END IF;

  v_helper_label := COALESCE(v_helper.helper_label, 'Level 5 Helper');
  v_balance_before := COALESCE(v_helper.wallet_balance, 0)::bigint;
  v_balance_after := v_balance_before - v_amount;

  UPDATE public.topup_helpers SET wallet_balance = v_balance_after, updated_at = now() WHERE id = v_helper.id;

  v_admin_id := COALESCE(public.current_admin_id_from_header(), auth.uid());

  INSERT INTO public.helper_transactions (helper_id, transaction_type, amount, balance_before, balance_after, reference_id, description, user_id)
  VALUES (v_helper.id, 'agency_withdrawal_reserve', -v_amount, v_balance_before, v_balance_after, _withdrawal_id, 'Reserved for agency withdrawal assignment', v_admin_id);

  UPDATE public.agency_withdrawals
  SET assigned_helper_id = v_helper.id, status = 'processing', claim_locked_until = NULL,
      payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object('assigned_trader', v_helper_label, 'assigned_at', now(), 'assigned_by', v_admin_id),
      updated_at = now()
  WHERE id = _withdrawal_id;

  RETURN jsonb_build_object('success', true, 'helper_id', v_helper.id, 'helper_name', v_helper_label, 'reserved_amount', v_amount, 'new_wallet_balance', v_balance_after);
END;
$function$;

-- Preserve anon EXECUTE (admin pages call via anon key + x-admin-token, Pkg365)
GRANT EXECUTE ON FUNCTION public.admin_approve_helper(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_helper_topup(uuid, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_helper_transaction(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_topup_trader_approval(uuid, boolean, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_payroll_to_trader(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- PART 2: Drop catch-all + legacy "Admin session full access" / user_roles=admin
-- on 23 helper/trader/topup tables; replace with split select/write policies
-- gated by helper/finance section permissions.
-- ---------------------------------------------------------------------------

DO $do$
DECLARE
  t text;
  helper_tables text[] := ARRAY[
    'coin_trader_transfers',
    'helper_accepted_payment_methods',
    'helper_admin_messages',
    'helper_applications',
    'helper_assigned_countries',
    'helper_country_payment_methods',
    'helper_diamond_packages',
    'helper_level_config',
    'helper_message_replies',
    'helper_notifications',
    'helper_orders',
    'helper_payment_methods',
    'helper_payment_visibility_log',
    'helper_topup_requests',
    'helper_upgrade_requests',
    'helper_withdrawal_requests',
    'payroll_requests',
    'topup_helper_levels',
    'topup_helpers',
    'topup_trader_approval_log',
    'topup_trader_gate_audit',
    'trader_level_purchases',
    'trader_level_tiers'
  ];
BEGIN
  FOREACH t IN ARRAY helper_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admin session full access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can manage helper applications" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can manage all helper payment methods" ON public.%I', t);

    -- SELECT: any active admin (dashboards)
    EXECUTE format($pol$
      CREATE POLICY pkg343_%I_admin_select ON public.%I
        FOR SELECT TO public
        USING (public.is_active_admin_session())
    $pol$, t, t);

    -- WRITE (ALL): finance/helper/topup/L5 section permission required
    EXECUTE format($pol$
      CREATE POLICY pkg343_%I_admin_write ON public.%I
        FOR ALL TO public
        USING (public.admin_has_any_section_permission(
          ARRAY['finance-hub','helper-management','level-5-helpers','topup-system','manual-topup','user-management','agency-management','withdrawals'], true
        ))
        WITH CHECK (public.admin_has_any_section_permission(
          ARRAY['finance-hub','helper-management','level-5-helpers','topup-system','manual-topup','user-management','agency-management','withdrawals'], true
        ))
    $pol$, t, t);
  END LOOP;
END $do$;

-- Audit-history hardening: forbid admin DELETE on logs
DROP POLICY IF EXISTS pkg343_topup_trader_approval_log_admin_write ON public.topup_trader_approval_log;
CREATE POLICY pkg343_topup_trader_approval_log_admin_write ON public.topup_trader_approval_log
  FOR INSERT TO public WITH CHECK (public.admin_has_any_section_permission(
    ARRAY['finance-hub','helper-management','level-5-helpers','topup-system','manual-topup','user-management'], true
  ));

DROP POLICY IF EXISTS pkg343_topup_trader_gate_audit_admin_write ON public.topup_trader_gate_audit;
-- gate_audit is service-role/SECDEF-only; no admin write needed
-- (SELECT policy already added above)

DROP POLICY IF EXISTS pkg343_coin_trader_transfers_admin_write ON public.coin_trader_transfers;
-- coin_trader_transfers is audit history; admins SELECT only, no DML
-- (SELECT policy already added above; existing coin_trader_transfers_no_insert + self-select preserved)

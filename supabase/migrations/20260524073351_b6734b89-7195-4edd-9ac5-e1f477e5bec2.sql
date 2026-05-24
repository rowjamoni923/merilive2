-- Section #8 final manual pass hardening
-- 1) No direct client INSERT into agency_withdrawals. Use request_agency_withdrawal RPC only.
DROP POLICY IF EXISTS "owner_insert_pending_withdrawals" ON public.agency_withdrawals;
DROP POLICY IF EXISTS "Agency owners can create withdrawal requests" ON public.agency_withdrawals;
DROP POLICY IF EXISTS "owner_insert_withdrawals" ON public.agency_withdrawals;

-- 2) Harden request_agency_withdrawal against payment_method/details spoofing and refund-bucket spoofing.
CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  p_agency_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'epay',
  p_payment_details jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance numeric;
  v_owner_id uuid;
  v_withdrawal_id uuid;
  v_fee_percent numeric;
  v_effective_fee_percent numeric;
  v_helper_commission_percent numeric;
  v_fee_beans numeric;
  v_net_beans numeric;
  v_net_diamonds_to_helper numeric;
  v_beans_per_usd numeric;
  v_withdrawal_beans_per_usd numeric;
  v_net_usd numeric;
  v_min_beans_a numeric;
  v_min_beans_b numeric;
  v_min_beans_required numeric;
  v_min_usd numeric;
  v_free_limit numeric;
  v_fee_text text;
  v_helper_text text;
  v_agency_text text;
  v_withdrawal_text text;
  v_fee_json jsonb;
  v_helper_json jsonb;
  v_agency_json jsonb;
  v_withdrawal_json jsonb;
  v_is_service boolean;
  v_method text;
  v_details jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  v_method := lower(trim(COALESCE(p_payment_method, '')));
  IF v_method = '' OR length(v_method) > 40 OR v_method !~ '^[a-z0-9_]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method');
  END IF;

  v_details := COALESCE(p_payment_details, '{}'::jsonb);
  IF jsonb_typeof(v_details) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment details');
  END IF;

  SELECT owner_id, wallet_balance INTO v_owner_id, v_current_balance
  FROM public.agencies
  WHERE id = p_agency_id
  FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  v_is_service := COALESCE(auth.role(),'') = 'service_role';
  IF NOT v_is_service
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND (auth.uid() IS NULL OR auth.uid() <> v_owner_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', v_current_balance);
  END IF;

  SELECT setting_value INTO v_agency_text FROM public.app_settings WHERE setting_key = 'agency_commission';
  BEGIN
    v_agency_json := v_agency_text::jsonb;
    v_beans_per_usd := (v_agency_json->>'coins_to_dollar_rate')::numeric;
    v_min_beans_b := (v_agency_json->>'min_payout')::numeric;
    v_min_usd := (v_agency_json->>'min_usd')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_beans_per_usd := NULL; v_min_beans_b := NULL; v_min_usd := NULL;
  END;

  SELECT setting_value INTO v_withdrawal_text FROM public.app_settings WHERE setting_key = 'withdrawal_settings';
  BEGIN
    v_withdrawal_json := v_withdrawal_text::jsonb;
    v_min_beans_a := (v_withdrawal_json->>'min_withdrawal')::numeric;
    v_withdrawal_beans_per_usd := (v_withdrawal_json->>'coins_to_dollar_rate')::numeric;
    v_free_limit := (v_withdrawal_json->>'free_withdrawal_limit')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_min_beans_a := NULL; v_withdrawal_beans_per_usd := NULL; v_free_limit := NULL;
  END;

  IF v_beans_per_usd IS NULL OR v_beans_per_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Beans-to-USD rate not configured.');
  END IF;
  IF v_withdrawal_beans_per_usd IS NULL OR v_withdrawal_beans_per_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal beans-to-USD rate not configured.');
  END IF;
  IF v_withdrawal_beans_per_usd <> v_beans_per_usd THEN
    RETURN jsonb_build_object('success', false, 'error', 'Beans-to-USD rates are mismatched.');
  END IF;
  IF v_min_beans_a IS NULL OR v_min_beans_b IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal beans not configured.');
  END IF;
  v_min_beans_required := GREATEST(v_min_beans_a, v_min_beans_b);
  IF v_min_usd IS NULL OR v_min_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum withdrawal USD not configured.');
  END IF;
  IF v_free_limit IS NULL OR v_free_limit < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Free withdrawal limit not configured.');
  END IF;
  IF p_amount < v_min_beans_required THEN
    RETURN jsonb_build_object('success', false,
      'error', format('Minimum withdrawal is %s beans', v_min_beans_required::bigint),
      'min_beans', v_min_beans_required, 'requested_beans', p_amount);
  END IF;

  SELECT setting_value INTO v_fee_text FROM public.app_settings WHERE setting_key = 'agency_withdrawal_fee';
  BEGIN
    v_fee_json := v_fee_text::jsonb;
    v_fee_percent := COALESCE((v_fee_json->>'rate')::numeric, (v_fee_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
    BEGIN v_fee_percent := v_fee_text::numeric;
    EXCEPTION WHEN OTHERS THEN v_fee_percent := NULL; END;
  END;
  IF v_fee_percent IS NULL OR v_fee_percent < 0 OR v_fee_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency withdrawal fee not configured.');
  END IF;

  SELECT setting_value INTO v_helper_text FROM public.app_settings WHERE setting_key = 'helper_diamond_commission';
  BEGIN
    v_helper_json := v_helper_text::jsonb;
    v_helper_commission_percent := COALESCE((v_helper_json->>'rate')::numeric, (v_helper_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
    BEGIN v_helper_commission_percent := v_helper_text::numeric;
    EXCEPTION WHEN OTHERS THEN v_helper_commission_percent := NULL; END;
  END;
  IF v_helper_commission_percent IS NULL OR v_helper_commission_percent < 0 OR v_helper_commission_percent > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper diamond commission not configured.');
  END IF;

  v_effective_fee_percent := CASE WHEN p_amount <= v_free_limit THEN 0 ELSE v_fee_percent END;
  v_fee_beans := FLOOR(p_amount * v_effective_fee_percent / 100.0);
  v_net_beans := p_amount - v_fee_beans;
  v_net_diamonds_to_helper := FLOOR(p_amount * (1 - v_helper_commission_percent / 100.0));
  v_net_usd := ROUND(v_net_beans / v_beans_per_usd, 2);

  IF v_net_usd < v_min_usd THEN
    RETURN jsonb_build_object('success', false,
      'error', format('Net withdrawal must be at least $%s USD (currently $%s after fee)', v_min_usd, v_net_usd),
      'min_usd', v_min_usd, 'net_usd', v_net_usd);
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);

  UPDATE public.agencies
  SET wallet_balance = wallet_balance - p_amount, updated_at = now()
  WHERE id = p_agency_id;

  INSERT INTO public.agency_withdrawals (
    agency_id, amount, payment_method, payment_details, notes, status,
    fee_percentage, net_amount_money, net_diamonds_to_helper
  ) VALUES (
    p_agency_id, p_amount, v_method,
    v_details
      || jsonb_build_object(
           'source_balance_bucket', 'wallet_balance',
           'configured_fee_percent', v_fee_percent,
           'effective_fee_percent', v_effective_fee_percent,
           'free_withdrawal_limit', v_free_limit,
           'fee_beans', v_fee_beans,
           'net_withdrawal_beans', v_net_beans,
           'net_withdrawal_usd', v_net_usd,
           'beans_per_usd', v_beans_per_usd,
           'helper_commission_percent', v_helper_commission_percent,
           'min_beans_enforced', v_min_beans_required,
           'min_usd_enforced', v_min_usd
         ),
    p_notes, 'pending',
    v_effective_fee_percent, v_net_usd, v_net_diamonds_to_helper
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', v_withdrawal_id,
    'amount_beans', p_amount,
    'configured_fee_percent', v_fee_percent,
    'fee_percent', v_effective_fee_percent,
    'fee_beans', v_fee_beans,
    'net_beans', v_net_beans,
    'net_usd', v_net_usd,
    'net_diamonds_to_helper', v_net_diamonds_to_helper,
    'beans_per_usd', v_beans_per_usd
  );
END;
$$;

-- 3) Rejection can only refund a not-paid pending withdrawal. No reject-after-paid double refunds.
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _w RECORD;
  _agency_owner_id UUID;
  _helper_user_id UUID;
  _is_payroll_helper BOOLEAN;
  _refund_bucket TEXT;
  _diamond_reward bigint;
  _swift_status text;
  _swift_payment_id text;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _w FROM public.agency_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _status = 'approved' THEN
    IF _w.status NOT IN ('pending', 'processing', 'completed', 'approved') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid approval transition');
    END IF;

    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _w.agency_id;
    SELECT EXISTS(
      SELECT 1 FROM public.topup_helpers th
      WHERE th.user_id = _agency_owner_id AND th.is_verified = true AND th.payroll_enabled = true
    ) INTO _is_payroll_helper;

    IF NOT _is_payroll_helper THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies SET commission_rate = 3, level = 'A1', updated_at = NOW()
      WHERE id = _w.agency_id;
    END IF;

    _diamond_reward := COALESCE(_w.net_diamonds_to_helper, 0);
    IF _w.assigned_helper_id IS NOT NULL
       AND _w.helper_diamonds_credited = false
       AND _diamond_reward > 0 THEN
      SELECT user_id INTO _helper_user_id FROM public.topup_helpers WHERE id = _w.assigned_helper_id;

      IF _helper_user_id IS NOT NULL THEN
        PERFORM set_config('app.bypass_profile_protection', 'true', true);
        UPDATE public.profiles
        SET coins    = COALESCE(coins, 0)    + _diamond_reward,
            diamonds = COALESCE(diamonds, 0) + _diamond_reward
        WHERE id = _helper_user_id;
        PERFORM set_config('app.bypass_profile_protection', 'false', true);

        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          _helper_user_id,
          'payroll_diamond_reward',
          '💎 Diamond Reward Credited!',
          'You received ' || _diamond_reward || ' diamonds for completing an agency withdrawal.',
          jsonb_build_object('withdrawal_id', _withdrawal_id, 'diamonds', _diamond_reward)
        );
      END IF;

      UPDATE public.agency_withdrawals
      SET status                   = 'approved',
          notes                    = COALESCE(_notes, notes),
          processed_at             = NOW(),
          processed_by             = auth.uid(),
          helper_diamonds_credited = true,
          updated_at               = now()
      WHERE id = _withdrawal_id;
    ELSE
      UPDATE public.agency_withdrawals
      SET status       = 'approved',
          notes        = COALESCE(_notes, notes),
          processed_at = COALESCE(processed_at, NOW()),
          processed_by = COALESCE(processed_by, auth.uid()),
          updated_at   = now()
      WHERE id = _withdrawal_id;
    END IF;

    IF _agency_owner_id IS NOT NULL AND _w.status <> 'approved' THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        _agency_owner_id,
        'withdrawal_approved',
        '✅ Withdrawal Approved!',
        'Your withdrawal of ' || _w.amount::TEXT || ' beans has been approved and paid.',
        jsonb_build_object('withdrawal_id', _withdrawal_id, 'amount', _w.amount)
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Withdrawal approved',
      'diamonds_given', CASE WHEN _w.helper_diamonds_credited THEN 0 ELSE _diamond_reward END
    );

  ELSIF _status = 'rejected' THEN
    IF _w.status <> 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only pending unpaid withdrawals can be rejected/refunded');
    END IF;

    _swift_payment_id := NULLIF(_w.payment_details #>> '{swift_pay_payout,payment_id}', '');
    _swift_status := lower(COALESCE(_w.payment_details #>> '{swift_pay_payout,status}', ''));
    IF _swift_payment_id IS NOT NULL AND _swift_status NOT IN ('failed', 'cancelled', 'canceled', 'expired') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Auto payout already initiated; cannot reject/refund until gateway confirms failure');
    END IF;

    UPDATE public.agency_withdrawals
    SET status = 'rejected', notes = _notes, processed_at = NOW(), processed_by = auth.uid(), updated_at = now()
    WHERE id = _withdrawal_id AND status = 'pending';

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already changed; refresh and try again');
    END IF;

    _refund_bucket := COALESCE(_w.payment_details->>'source_balance_bucket', 'wallet_balance');
    IF _refund_bucket NOT IN ('wallet_balance', 'beans_balance') THEN
      _refund_bucket := 'wallet_balance';
    END IF;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
    IF _refund_bucket = 'beans_balance' THEN
      UPDATE public.agencies SET beans_balance = COALESCE(beans_balance, 0) + _w.amount, updated_at = NOW()
      WHERE id = _w.agency_id;
    ELSE
      UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _w.amount, updated_at = NOW()
      WHERE id = _w.agency_id;
    END IF;

    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _w.agency_id;
    IF _agency_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        _agency_owner_id,
        'withdrawal_rejected',
        '❌ Withdrawal Rejected',
        'Your withdrawal of ' || _w.amount::TEXT || ' beans has been refunded.',
        jsonb_build_object('withdrawal_id', _withdrawal_id, 'amount', _w.amount, 'notes', _notes, 'refund_bucket', _refund_bucket)
      );
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal rejected');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported status: ' || _status);
  END IF;
END;
$$;
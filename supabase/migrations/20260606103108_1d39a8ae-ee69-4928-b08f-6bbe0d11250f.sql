
-- Pkg428: Redirect L5 helper diamond reward to Trader Wallet (topup_helpers.wallet_balance)
-- instead of personal profiles.coins. Aligns with stated economy: L5 payroll earnings stay
-- inside Trader Wallet so helper can recycle diamonds back into user/agency top-ups.

CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _w RECORD;
  _agency_owner_id UUID;
  _helper_user_id UUID;
  _is_payroll_helper BOOLEAN;
  _refund_bucket TEXT;
  _diamond_reward bigint;
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

      -- Pkg428: credit Trader Wallet (topup_helpers.wallet_balance), NOT personal coins.
      UPDATE public.topup_helpers
      SET wallet_balance = COALESCE(wallet_balance, 0) + _diamond_reward,
          updated_at     = now()
      WHERE id = _w.assigned_helper_id;

      -- Ledger row so Trader Wallet history shows the reward
      BEGIN
        INSERT INTO public.helper_transactions (helper_id, user_id, transaction_type, amount, description, status, created_at)
        VALUES (_w.assigned_helper_id, _helper_user_id, 'agency_withdrawal_reward', _diamond_reward,
                'Diamond reward for processing agency withdrawal', 'completed', now());
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      IF _helper_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          _helper_user_id,
          'payroll_diamond_reward',
          '💎 Trader Wallet Credited!',
          'You received ' || _diamond_reward || ' diamonds in your Trader Wallet for completing an agency withdrawal.',
          jsonb_build_object('withdrawal_id', _withdrawal_id, 'diamonds', _diamond_reward, 'destination', 'trader_wallet')
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
    IF _swift_payment_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Gateway payout was already initiated; normal reject/refund is blocked');
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
$function$;


CREATE OR REPLACE FUNCTION public.approve_agency_withdrawal(_withdrawal_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _w record;
  _helper_user_id uuid;
BEGIN
  IF NOT (
    is_admin(auth.uid())
    OR is_active_admin_session()
    OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _w FROM agency_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _w.status NOT IN ('completed', 'approved') THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not yet processed by helper');
  END IF;

  IF _w.assigned_helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No helper assigned to this withdrawal');
  END IF;

  IF _w.helper_diamonds_credited = false AND COALESCE(_w.net_diamonds_to_helper, 0) > 0 THEN
    -- Pkg428: credit Trader Wallet, NOT personal coins.
    UPDATE topup_helpers
    SET wallet_balance = COALESCE(wallet_balance, 0) + _w.net_diamonds_to_helper,
        updated_at     = now()
    WHERE id = _w.assigned_helper_id;

    SELECT user_id INTO _helper_user_id FROM topup_helpers WHERE id = _w.assigned_helper_id;

    BEGIN
      INSERT INTO public.helper_transactions (helper_id, user_id, transaction_type, amount, description, status, created_at)
      VALUES (_w.assigned_helper_id, _helper_user_id, 'agency_withdrawal_reward', _w.net_diamonds_to_helper,
              'Diamond reward for processing agency withdrawal', 'completed', now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    UPDATE agency_withdrawals
    SET helper_diamonds_credited = true,
        status                   = 'approved',
        processed_at             = now(),
        processed_by             = auth.uid(),
        updated_at               = now()
    WHERE id = _withdrawal_id;

    IF _helper_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (
        _helper_user_id,
        'payroll_diamond_reward',
        '💎 Trader Wallet Credited!',
        'You received ' || _w.net_diamonds_to_helper || ' diamonds in your Trader Wallet for completing an agency withdrawal.',
        jsonb_build_object('withdrawal_id', _withdrawal_id, 'diamonds', _w.net_diamonds_to_helper, 'destination', 'trader_wallet')
      );
    END IF;
  ELSE
    UPDATE agency_withdrawals
    SET status       = 'approved',
        processed_at = COALESCE(processed_at, now()),
        processed_by = COALESCE(processed_by, auth.uid()),
        updated_at   = now()
    WHERE id = _withdrawal_id;
  END IF;

  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    auth.uid()::text,
    'approve_agency_withdrawal',
    _withdrawal_id::text,
    'withdrawal',
    jsonb_build_object(
      'amount_beans',          _w.amount,
      'diamonds_to_helper',    _w.net_diamonds_to_helper,
      'helper_id',             _w.assigned_helper_id,
      'agency_id',             _w.agency_id,
      'already_credited',      _w.helper_diamonds_credited,
      'destination',           'trader_wallet'
    )
  );

  RETURN json_build_object(
    'success', true,
    'diamonds_given', CASE WHEN _w.helper_diamonds_credited THEN 0 ELSE _w.net_diamonds_to_helper END,
    'destination', 'trader_wallet'
  );
END;
$function$;

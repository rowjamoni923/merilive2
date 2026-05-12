
-- Revert helper RPC: set status='processing' (was 'completed' in Pkg33) — matches all existing UI
DROP FUNCTION IF EXISTS public.helper_process_agency_withdrawal(uuid, uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.helper_process_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _screenshot_url text,
  _transaction_id text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _current record;
  _payment_details jsonb;
  _proof jsonb;
  _safe_tx text;
  _safe_notes text;
  _helper_rate numeric;
  _diamond_reward bigint;
BEGIN
  IF _screenshot_url IS NULL OR length(trim(_screenshot_url)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment screenshot is required');
  END IF;

  _safe_tx := trim(COALESCE(_transaction_id, ''));
  IF length(_safe_tx) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction ID must be at least 4 characters');
  END IF;
  _safe_tx := left(_safe_tx, 120);
  _safe_notes := NULLIF(left(trim(COALESCE(_notes, '')), 500), '');

  SELECT * INTO _current
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _current.status NOT IN ('pending', 'claimed', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already finalized');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = _helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND th.is_verified = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized helper');
  END IF;

  IF _current.assigned_helper_id IS NOT NULL
     AND _current.assigned_helper_id <> _helper_id
     AND _current.claim_locked_until IS NOT NULL
     AND _current.claim_locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is locked by another helper');
  END IF;

  -- Admin-set rate (no hardcoded fallback)
  SELECT NULLIF(setting_value->>'rate','')::numeric INTO _helper_rate
  FROM public.app_settings
  WHERE setting_key = 'helper_diamond_commission';

  IF _helper_rate IS NULL OR _helper_rate < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper diamond commission rate not configured. Ask admin to set it in Pricing Hub.');
  END IF;

  _diamond_reward := FLOOR(COALESCE(_current.amount, 0) * _helper_rate / 100.0)::bigint;

  _proof := jsonb_build_object(
    'helper_payment_screenshot', _screenshot_url,
    'helper_transaction_id',     _safe_tx,
    'helper_notes',              _safe_notes,
    'diamond_reward',            _diamond_reward,
    'helper_rate_percent',       _helper_rate,
    'helper_processed_at',       now(),
    'processed_by_helper_id',    _helper_id
  );

  _payment_details := COALESCE(_current.payment_details, '{}'::jsonb) || _proof;

  UPDATE public.agency_withdrawals
  SET status                  = 'processing',
      assigned_helper_id      = _helper_id,
      claim_locked_until      = NULL,
      helper_processed_at     = now(),
      helper_proof            = _proof,
      payment_details         = _payment_details,
      net_diamonds_to_helper  = _diamond_reward,
      fee_percentage          = _helper_rate,
      updated_at              = now()
  WHERE id = _withdrawal_id;

  BEGIN
    DELETE FROM public.agency_withdrawal_locks WHERE withdrawal_id = _withdrawal_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'diamond_reward', _diamond_reward,
    'helper_rate_percent', _helper_rate
  );
END;
$function$;

-- Rebuild admin_process_withdrawal: admin-set diamond %, credit DIAMONDS to helper profile, idempotent
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  _withdrawal_id uuid,
  _status text,
  _notes text DEFAULT NULL
)
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
BEGIN
  IF NOT public.is_caller_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _w FROM public.agency_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _w.status NOT IN ('pending', 'processing', 'completed', 'approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status transition');
  END IF;

  IF _status = 'approved' THEN
    -- Reset agency tier (only if owner is not a payroll helper) — preserves existing business rule
    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _w.agency_id;
    SELECT EXISTS(
      SELECT 1 FROM public.topup_helpers th
      WHERE th.user_id = _agency_owner_id AND th.is_verified = true AND th.payroll_enabled = true
    ) INTO _is_payroll_helper;

    IF NOT _is_payroll_helper THEN
      UPDATE public.agencies SET commission_rate = 3, level = 'A1', updated_at = NOW()
      WHERE id = _w.agency_id;
    END IF;

    -- Credit diamonds to helper profile exactly once
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

        INSERT INTO public.notifications (user_id, type, title, message, body, data)
        VALUES (
          _helper_user_id,
          'payroll_diamond_reward',
          '💎 Diamond Reward Credited!',
          'You received ' || _diamond_reward || ' diamonds for completing an agency withdrawal.',
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

    -- Notify agency owner
    IF _agency_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, body, data)
      VALUES (
        _agency_owner_id,
        'withdrawal_approved',
        '✅ Withdrawal Approved!',
        'Your withdrawal of ' || _w.amount::TEXT || ' beans has been approved and paid.',
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
    UPDATE public.agency_withdrawals
    SET status = 'rejected', notes = _notes, processed_at = NOW(), processed_by = auth.uid(), updated_at = now()
    WHERE id = _withdrawal_id;

    -- Refund agency
    _refund_bucket := COALESCE(_w.payment_details->>'source_balance_bucket', 'wallet_balance');
    IF _refund_bucket = 'beans_balance' THEN
      UPDATE public.agencies SET beans_balance = COALESCE(beans_balance, 0) + _w.amount, updated_at = NOW()
      WHERE id = _w.agency_id;
    ELSE
      UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _w.amount, updated_at = NOW()
      WHERE id = _w.agency_id;
    END IF;

    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _w.agency_id;
    IF _agency_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, body, data)
      VALUES (
        _agency_owner_id,
        'withdrawal_rejected',
        '❌ Withdrawal Rejected',
        'Your withdrawal of ' || _w.amount::TEXT || ' beans has been refunded.',
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

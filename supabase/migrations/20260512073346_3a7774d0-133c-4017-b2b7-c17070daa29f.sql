
-- 1) Idempotency flag
ALTER TABLE public.agency_withdrawals
  ADD COLUMN IF NOT EXISTS helper_diamonds_credited boolean NOT NULL DEFAULT false;

-- 2) Fix helper-side processing RPC to use REAL columns and compute diamond reward from admin settings
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
  -- Validate inputs
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

  -- Authorize helper
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

  -- Block if claimed by another helper and lock still active
  IF _current.assigned_helper_id IS NOT NULL
     AND _current.assigned_helper_id <> _helper_id
     AND _current.claim_locked_until IS NOT NULL
     AND _current.claim_locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is locked by another helper');
  END IF;

  -- Pull admin-set helper diamond commission % (no hardcoded fallback)
  SELECT NULLIF(setting_value->>'rate','')::numeric INTO _helper_rate
  FROM public.app_settings
  WHERE setting_key = 'helper_diamond_commission';

  IF _helper_rate IS NULL OR _helper_rate < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper diamond commission rate not configured. Ask admin to set it in Pricing Hub.');
  END IF;

  _diamond_reward := FLOOR(COALESCE(_current.amount, 0) * _helper_rate / 100.0)::bigint;

  -- Build proof JSON (single source) + mirror into payment_details for back-compat readers
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
  SET status                  = 'completed',
      assigned_helper_id      = _helper_id,
      claim_locked_until      = NULL,
      helper_processed_at     = now(),
      helper_proof            = _proof,
      payment_details         = _payment_details,
      net_diamonds_to_helper  = _diamond_reward,
      fee_percentage          = _helper_rate,
      updated_at              = now()
  WHERE id = _withdrawal_id;

  -- Clean up any stray legacy lock row (no-op if table missing)
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

-- 3) Make admin approval idempotent + accept 'completed' status, credit diamonds exactly once
CREATE OR REPLACE FUNCTION public.approve_agency_withdrawal(_withdrawal_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _w record;
BEGIN
  -- Admin only (covers regular admin auth + active admin session)
  IF NOT (
    is_admin(auth.uid())
    OR is_active_admin_session()
    OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _w
  FROM agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _w.status NOT IN ('completed', 'approved') THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not yet processed by helper');
  END IF;

  IF _w.assigned_helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No helper assigned to this withdrawal');
  END IF;

  -- Credit diamonds to helper exactly once
  IF _w.helper_diamonds_credited = false AND COALESCE(_w.net_diamonds_to_helper, 0) > 0 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    UPDATE profiles
    SET coins    = COALESCE(coins, 0)    + _w.net_diamonds_to_helper,
        diamonds = COALESCE(diamonds, 0) + _w.net_diamonds_to_helper
    WHERE id = (SELECT user_id FROM topup_helpers WHERE id = _w.assigned_helper_id);

    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    UPDATE agency_withdrawals
    SET helper_diamonds_credited = true,
        status                   = 'approved',
        processed_at             = now(),
        processed_by             = auth.uid(),
        updated_at               = now()
    WHERE id = _withdrawal_id;

    -- Notify helper
    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT
      th.user_id,
      'payroll_diamond_reward',
      '💎 Diamond Reward Credited!',
      'You received ' || _w.net_diamonds_to_helper || ' diamonds for completing an agency withdrawal.',
      jsonb_build_object('withdrawal_id', _withdrawal_id, 'diamonds', _w.net_diamonds_to_helper)
    FROM topup_helpers th
    WHERE th.id = _w.assigned_helper_id;
  ELSE
    -- Already credited or zero reward — just finalize status
    UPDATE agency_withdrawals
    SET status       = 'approved',
        processed_at = COALESCE(processed_at, now()),
        processed_by = COALESCE(processed_by, auth.uid()),
        updated_at   = now()
    WHERE id = _withdrawal_id;
  END IF;

  -- Audit log
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
      'already_credited',      _w.helper_diamonds_credited
    )
  );

  RETURN json_build_object(
    'success', true,
    'diamonds_given', CASE WHEN _w.helper_diamonds_credited THEN 0 ELSE _w.net_diamonds_to_helper END
  );
END;
$function$;

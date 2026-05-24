-- Section #8 deeper manual audit hardening: helper scope, payout uniqueness, legacy completion safety

-- 1) Remove stale helper SELECT policy and recreate it with method + country boundaries.
DROP POLICY IF EXISTS "Level 5 helpers can view agency withdrawals" ON public.agency_withdrawals;

CREATE POLICY "Level 5 helpers can view agency withdrawals"
ON public.agency_withdrawals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND th.is_verified = true
      AND (
        (
          agency_withdrawals.status = 'pending'
          AND COALESCE(agency_withdrawals.payment_method, '') NOT IN ('epay', 'crypto_auto')
          AND th.country_code = COALESCE(
            agency_withdrawals.country_code,
            agency_withdrawals.payment_details->>'country_code'
          )
        )
        OR (
          agency_withdrawals.status = 'processing'
          AND agency_withdrawals.assigned_helper_id = th.id
        )
      )
  )
);

-- 2) Prevent duplicate external proof IDs across processed/approved withdrawals.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_withdrawals_helper_tx_unique
ON public.agency_withdrawals ((lower(nullif(helper_proof->>'helper_transaction_id', ''))))
WHERE helper_proof ? 'helper_transaction_id'
  AND status IN ('processing', 'completed', 'approved');

CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_withdrawals_swift_payment_id_unique
ON public.agency_withdrawals ((nullif(payment_details #>> '{swift_pay_payout,payment_id}', '')))
WHERE nullif(payment_details #>> '{swift_pay_payout,payment_id}', '') IS NOT NULL;

-- 3) Stop helper notifications for admin/manual epay and crypto_auto rows.
CREATE OR REPLACE FUNCTION public.notify_helpers_on_agency_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper RECORD;
  _agency_name TEXT;
  _agency_country TEXT;
  _usd_amount NUMERIC;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payment_method, '') IN ('epay', 'crypto_auto') THEN
    RETURN NEW;
  END IF;

  SELECT a.name
  INTO _agency_name
  FROM public.agencies a
  WHERE a.id = NEW.agency_id;

  _agency_country := COALESCE(
    NEW.country_code,
    NEW.payment_details->>'country_code'
  );

  IF _agency_country IS NULL OR btrim(_agency_country) = '' THEN
    RETURN NEW;
  END IF;

  _usd_amount := ROUND(NEW.amount / 9000.0, 2);

  FOR _helper IN
    SELECT th.id AS helper_id, th.user_id
    FROM public.topup_helpers th
    WHERE th.is_active = true
      AND th.is_verified = true
      AND th.payroll_enabled = true
      AND th.trader_level = 5
      AND th.country_code = _agency_country
  LOOP
    INSERT INTO public.helper_notifications (helper_id, type, title, message, data)
    VALUES (
      _helper.helper_id,
      'new_withdrawal_request',
      '💰 New Agency Withdrawal Request',
      COALESCE(_agency_name, 'An agency') || ' requested $' || _usd_amount::TEXT || ' withdrawal. Tap to claim and process.',
      jsonb_build_object(
        'withdrawal_id', NEW.id,
        'agency_id', NEW.agency_id,
        'agency_name', _agency_name,
        'amount', NEW.amount,
        'usd_amount', _usd_amount,
        'payment_method', NEW.payment_method,
        'country_code', _agency_country,
        'source', 'agency_withdrawal_trigger'
      )
    );

    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      _helper.user_id,
      'new_withdrawal_request',
      '💰 New Agency Withdrawal Request',
      COALESCE(_agency_name, 'An agency') || ' requested $' || _usd_amount::TEXT || ' withdrawal.',
      jsonb_build_object(
        'withdrawal_id', NEW.id,
        'agency_id', NEW.agency_id,
        'agency_name', _agency_name,
        'amount', NEW.amount,
        'usd_amount', _usd_amount,
        'country_code', _agency_country,
        'action_url', '/helper-dashboard?tab=agency-withdrawals',
        'source', 'agency_withdrawal_trigger'
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_payroll_helpers_on_agency_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country_code text;
BEGIN
  IF COALESCE(NEW.payment_method, '') IN ('epay', 'crypto_auto') THEN
    RETURN NEW;
  END IF;

  v_country_code := COALESCE(
    NEW.payment_details->>'country_code',
    NEW.country_code
  );

  IF v_country_code IS NULL OR btrim(v_country_code) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.helper_notifications (helper_id, type, title, message, data, is_read)
  SELECT
    th.id,
    'new_withdrawal_request',
    '💸 New Withdrawal Request!',
    format(
      'Agency "%s" requested $%s withdrawal (%s)',
      COALESCE(a.name, 'Agency'),
      COALESCE((NEW.payment_details->>'usd_amount'), COALESCE(NEW.usd_amount::text, '0')),
      upper(COALESCE(NEW.payment_method, 'local'))
    ),
    jsonb_build_object(
      'withdrawal_id', NEW.id,
      'agency_id', NEW.agency_id,
      'agency_name', COALESCE(a.name, 'Agency'),
      'amount_beans', NEW.amount,
      'amount_usd', COALESCE((NEW.payment_details->>'usd_amount')::numeric, NEW.usd_amount),
      'country_code', v_country_code,
      'payment_method', NEW.payment_method,
      'source', 'agency_withdrawal_trigger'
    ),
    false
  FROM public.topup_helpers th
  LEFT JOIN public.agencies a ON a.id = NEW.agency_id
  WHERE COALESCE(th.is_active, true) = true
    AND COALESCE(th.is_verified, false) = true
    AND COALESCE(th.payroll_enabled, false) = true
    AND th.trader_level = 5
    AND th.country_code = v_country_code;

  RETURN NEW;
END;
$$;

-- 4) Claim must be same-country and manual-helper method only.
CREATE OR REPLACE FUNCTION public.claim_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _lock_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current public.agency_withdrawals%ROWTYPE;
  _helper public.topup_helpers%ROWTYPE;
  _effective_lock_seconds integer := LEAST(GREATEST(COALESCE(_lock_seconds, 30), 10), 30);
  _lock_until timestamptz := now() + make_interval(secs => _effective_lock_seconds);
  _withdrawal_country text;
BEGIN
  SELECT * INTO _helper
  FROM public.topup_helpers
  WHERE id = _helper_id
    AND user_id = auth.uid()
    AND trader_level = 5
    AND payroll_enabled = true
    AND is_active = true
    AND is_verified = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized helper');
  END IF;

  SELECT * INTO _current
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _current.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is no longer available');
  END IF;

  IF COALESCE(_current.payment_method, '') IN ('epay', 'crypto_auto') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This withdrawal is not helper-processable');
  END IF;

  _withdrawal_country := COALESCE(_current.country_code, _current.payment_details->>'country_code');
  IF _withdrawal_country IS NULL OR btrim(_withdrawal_country) = '' OR _helper.country_code IS DISTINCT FROM _withdrawal_country THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is outside your country');
  END IF;

  IF _current.assigned_helper_id IS NOT NULL
     AND _current.assigned_helper_id <> _helper_id
     AND _current.claim_locked_until IS NOT NULL
     AND _current.claim_locked_until > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Already claimed',
      'claim_locked_until', _current.claim_locked_until,
      'assigned_helper_id', _current.assigned_helper_id
    );
  END IF;

  UPDATE public.agency_withdrawals
  SET assigned_helper_id = _helper_id,
      claim_locked_until = _lock_until,
      updated_at = now()
  WHERE id = _withdrawal_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'assigned_helper_id', _helper_id,
    'claim_locked_until', _lock_until
  );
END;
$$;

-- 5) Processing must be same-country, manual-helper method only, and have a unique transaction ID.
CREATE OR REPLACE FUNCTION public.helper_process_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _screenshot_url text,
  _transaction_id text,
  _notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current record;
  _helper public.topup_helpers%ROWTYPE;
  _payment_details jsonb;
  _proof jsonb;
  _safe_tx text;
  _safe_tx_key text;
  _safe_notes text;
  _helper_rate numeric;
  _diamond_reward bigint;
  _withdrawal_country text;
BEGIN
  IF _screenshot_url IS NULL OR length(trim(_screenshot_url)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment screenshot is required');
  END IF;

  _safe_tx := trim(COALESCE(_transaction_id, ''));
  IF length(_safe_tx) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction ID must be at least 4 characters');
  END IF;
  _safe_tx := left(_safe_tx, 120);
  _safe_tx_key := lower(_safe_tx);
  _safe_notes := NULLIF(left(trim(COALESCE(_notes, '')), 500), '');

  SELECT * INTO _helper
  FROM public.topup_helpers th
  WHERE th.id = _helper_id
    AND th.user_id = auth.uid()
    AND th.trader_level = 5
    AND th.payroll_enabled = true
    AND th.is_active = true
    AND th.is_verified = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized helper');
  END IF;

  SELECT * INTO _current
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _current.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already finalized');
  END IF;

  IF COALESCE(_current.payment_method, '') IN ('epay', 'crypto_auto') THEN
    RETURN jsonb_build_object('success', false, 'error', 'This withdrawal is not helper-processable');
  END IF;

  _withdrawal_country := COALESCE(_current.country_code, _current.payment_details->>'country_code');
  IF _withdrawal_country IS NULL OR btrim(_withdrawal_country) = '' OR _helper.country_code IS DISTINCT FROM _withdrawal_country THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is outside your country');
  END IF;

  IF _current.assigned_helper_id IS NOT NULL
     AND _current.assigned_helper_id <> _helper_id
     AND _current.claim_locked_until IS NOT NULL
     AND _current.claim_locked_until > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal is locked by another helper');
  END IF;

  IF _current.status = 'processing' AND _current.assigned_helper_id IS DISTINCT FROM _helper_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already assigned to another helper');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agency_withdrawals aw
    WHERE aw.id <> _withdrawal_id
      AND aw.status IN ('processing', 'completed', 'approved')
      AND lower(NULLIF(aw.helper_proof->>'helper_transaction_id', '')) = _safe_tx_key
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Duplicate transaction ID');
  END IF;

  SELECT NULLIF(setting_value->>'rate','')::numeric INTO _helper_rate
  FROM public.app_settings
  WHERE setting_key = 'helper_diamond_commission';

  IF _helper_rate IS NULL OR _helper_rate < 0 OR _helper_rate > 100 THEN
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
    'processed_by_helper_id',    _helper_id,
    'helper_country_code',       _helper.country_code
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
$$;

-- 6) Legacy completion can only move the helper's already-processed row forward; it cannot overwrite proof.
CREATE OR REPLACE FUNCTION public.complete_agency_withdrawal(_withdrawal_id uuid, _proof jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_row record;
  _current record;
  _withdrawal_country text;
BEGIN
  SELECT * INTO _helper_row
  FROM public.topup_helpers
  WHERE user_id = auth.uid()
    AND trader_level = 5
    AND payroll_enabled = true
    AND is_active = true
    AND is_verified = true
  LIMIT 1;

  IF _helper_row.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized helper');
  END IF;

  SELECT * INTO _current
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _current.status <> 'processing'
     OR _current.assigned_helper_id IS DISTINCT FROM _helper_row.id THEN
    RETURN json_build_object('success', false, 'error', 'Order not processed by you or already completed');
  END IF;

  IF COALESCE(_current.payment_method, '') IN ('epay', 'crypto_auto') THEN
    RETURN json_build_object('success', false, 'error', 'This withdrawal is not helper-processable');
  END IF;

  _withdrawal_country := COALESCE(_current.country_code, _current.payment_details->>'country_code');
  IF _withdrawal_country IS NULL OR btrim(_withdrawal_country) = '' OR _helper_row.country_code IS DISTINCT FROM _withdrawal_country THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal is outside your country');
  END IF;

  UPDATE public.agency_withdrawals
  SET status = 'completed',
      payment_details = COALESCE(payment_details, '{}'::jsonb)
        || jsonb_build_object('helper_completed_at', now()),
      updated_at = now()
  WHERE id = _withdrawal_id;

  BEGIN
    DELETE FROM public.agency_withdrawal_locks WHERE withdrawal_id = _withdrawal_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN json_build_object('success', true);
END;
$$;
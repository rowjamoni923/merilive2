-- Pkg432: Auto-grant verified Trader (topup_helpers) on crypto auto-payment for helper application.
-- When a user pays via SwiftPay crypto for an L1+ helper upgrade and the on-chain deposit is
-- credited (swift_pay_topups.status='credited'/'paid'/'completed'), this RPC atomically:
--   1. Verifies the topup belongs to the caller and was paid.
--   2. Computes detected_level = highest active trader_level_tier with upgrade_cost_usd <= paid USD.
--   3. Upserts topup_helpers row (is_verified=true, is_active=true, trader_level=detected_level).
--   4. Inserts helper_applications row with status='approved' for full audit trail.
--   5. Idempotent on payment_transaction_id so repeat clicks never re-grant or double-insert.

CREATE OR REPLACE FUNCTION public.auto_grant_helper_from_crypto_payment(
  _topup_id uuid,
  _selected_level integer,
  _contact_whatsapp text DEFAULT NULL,
  _contact_telegram text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _payroll_requested boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_topup record;
  v_paid_usd numeric;
  v_detected_level int;
  v_helper_id uuid;
  v_country text;
  v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _topup_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing topup id');
  END IF;

  -- Verify the topup belongs to the caller and was actually paid.
  SELECT id, user_id, price_usd, status
    INTO v_topup
  FROM public.swift_pay_topups
  WHERE id = _topup_id
  LIMIT 1;

  IF v_topup IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment record not found');
  END IF;

  IF v_topup.user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment does not belong to you');
  END IF;

  IF v_topup.status NOT IN ('credited','paid','completed','finished') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not yet verified on-chain');
  END IF;

  v_paid_usd := COALESCE(v_topup.price_usd, 0);
  IF v_paid_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment amount');
  END IF;

  -- Idempotency: if an approved application already exists for this exact topup, return it.
  SELECT id INTO v_existing FROM public.helper_applications
   WHERE user_id = v_uid AND payment_transaction_id = _topup_id::text AND status = 'approved'
   LIMIT 1;
  IF FOUND THEN
    SELECT id, trader_level INTO v_helper_id, v_detected_level
      FROM public.topup_helpers WHERE user_id = v_uid LIMIT 1;
    RETURN jsonb_build_object('success', true, 'helper_id', v_helper_id, 'trader_level', v_detected_level, 'idempotent', true);
  END IF;

  -- Detect the highest tier the paid amount unlocks.
  SELECT level_number INTO v_detected_level
  FROM public.trader_level_tiers
  WHERE is_active = true
    AND upgrade_cost_usd IS NOT NULL
    AND upgrade_cost_usd > 0
    AND upgrade_cost_usd <= v_paid_usd + 0.001
    AND level_number BETWEEN 1 AND 5
  ORDER BY level_number DESC
  LIMIT 1;

  IF v_detected_level IS NULL THEN
    v_detected_level := COALESCE(NULLIF(_selected_level, 0), 1);
  END IF;

  -- Pull country from profile (default BD).
  SELECT COALESCE(NULLIF(country_code, ''), 'BD') INTO v_country
  FROM public.profiles WHERE id = v_uid LIMIT 1;
  v_country := COALESCE(v_country, 'BD');

  -- Upsert topup_helpers: verified + active immediately.
  -- For existing rows we ONLY upgrade the level (never downgrade) and keep prior approval timestamps.
  INSERT INTO public.topup_helpers (
    user_id, is_active, is_verified, trader_level, country_code,
    contact_info, approved_at, approved_by, updated_at
  ) VALUES (
    v_uid, true, true, v_detected_level, v_country,
    jsonb_strip_nulls(jsonb_build_object(
      'whatsapp', NULLIF(_contact_whatsapp, ''),
      'telegram', NULLIF(_contact_telegram, '')
    )),
    now(), v_uid, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_active    = true,
    is_verified  = true,
    trader_level = GREATEST(public.topup_helpers.trader_level, EXCLUDED.trader_level),
    country_code = COALESCE(public.topup_helpers.country_code, EXCLUDED.country_code),
    contact_info = COALESCE(public.topup_helpers.contact_info, '{}'::jsonb) || EXCLUDED.contact_info,
    approved_at  = COALESCE(public.topup_helpers.approved_at, now()),
    approved_by  = COALESCE(public.topup_helpers.approved_by, v_uid),
    updated_at   = now()
  RETURNING id INTO v_helper_id;

  -- Audit row in helper_applications (status='approved' so the admin queue stays clean).
  BEGIN
    INSERT INTO public.helper_applications (
      user_id, agency_id, requested_level, payroll_requested,
      contact_whatsapp, contact_telegram, reason,
      payment_method, payment_details, payment_transaction_id,
      status, reviewed_at, reviewed_by
    ) VALUES (
      v_uid, NULL, v_detected_level,
      CASE WHEN v_detected_level = 5 THEN COALESCE(_payroll_requested, false) ELSE false END,
      NULLIF(_contact_whatsapp, ''), NULLIF(_contact_telegram, ''), NULLIF(_reason, ''),
      'MeriCash Crypto Gateway (Auto)',
      jsonb_build_object(
        'method', 'swift_pay_crypto',
        'topup_id', _topup_id,
        'amount_usd', v_paid_usd,
        'selected_level', _selected_level,
        'detected_level', v_detected_level,
        'auto_verified', true,
        'auto_granted', true
      ),
      _topup_id::text,
      'approved', now(), v_uid
    );
  EXCEPTION WHEN unique_violation THEN
    -- Pre-existing application row from earlier flow — mark approved.
    UPDATE public.helper_applications
       SET status = 'approved',
           reviewed_at = COALESCE(reviewed_at, now()),
           reviewed_by = COALESCE(reviewed_by, v_uid),
           payment_transaction_id = COALESCE(payment_transaction_id, _topup_id::text)
     WHERE user_id = v_uid AND payment_transaction_id = _topup_id::text;
  WHEN OTHERS THEN
    -- Never block the grant on audit row failure.
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'helper_id', v_helper_id,
    'trader_level', v_detected_level,
    'amount_usd', v_paid_usd
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_grant_helper_from_crypto_payment(uuid, integer, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_grant_helper_from_crypto_payment(uuid, integer, text, text, text, boolean) TO anon, authenticated, service_role;

-- Pkg433: close the "user pays then closes app" gap in Trader Wallet auto-grant.
-- 1) Persist helper-application intent on the swift_pay_topups row.
-- 2) Extend the auto-grant RPC to allow service_role to grant using the stored intent.
-- 3) Keep the existing user-facing path 100% backward compatible.

BEGIN;

-- 1) Intent column on swift_pay_topups (nullable, only set when paying for a helper upgrade).
ALTER TABLE public.swift_pay_topups
  ADD COLUMN IF NOT EXISTS helper_application_intent jsonb;

COMMENT ON COLUMN public.swift_pay_topups.helper_application_intent IS
  'Pkg433: when set, swift-pay-poll-deposits will auto-grant the Trader Wallet (topup_helpers) on credit. Shape: {selected_level int, contact_whatsapp text, contact_telegram text, reason text, payroll_requested bool}';

-- 2) Replace RPC: allow service_role to grant via stored intent; user path unchanged.
DROP FUNCTION IF EXISTS public.auto_grant_helper_from_crypto_payment(uuid, integer, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.auto_grant_helper_from_crypto_payment(
  _topup_id uuid,
  _selected_level integer DEFAULT NULL,
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
  v_is_service boolean := (current_setting('request.jwt.claim.role', true) = 'service_role');
  v_topup record;
  v_intent jsonb;
  v_paid_usd numeric;
  v_detected_level int;
  v_helper_id uuid;
  v_country text;
  v_target_user uuid;
  v_selected_level int;
  v_contact_whatsapp text;
  v_contact_telegram text;
  v_reason text;
  v_payroll boolean;
  v_existing_id uuid;
BEGIN
  IF _topup_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing topup id');
  END IF;

  SELECT id, user_id, price_usd, status, helper_application_intent
    INTO v_topup
  FROM public.swift_pay_topups
  WHERE id = _topup_id
  LIMIT 1;

  IF v_topup IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment record not found');
  END IF;

  -- Caller resolution:
  --   * service_role  → grants on behalf of swift_pay_topups.user_id using stored intent
  --   * authenticated → must be the topup owner, params (or stored intent) provide context
  IF v_is_service THEN
    v_target_user := v_topup.user_id;
  ELSE
    IF v_uid IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;
    IF v_topup.user_id <> v_uid THEN
      RETURN jsonb_build_object('success', false, 'error', 'Payment does not belong to you');
    END IF;
    v_target_user := v_uid;
  END IF;

  IF v_topup.status NOT IN ('credited','paid','completed','finished') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not yet verified on-chain');
  END IF;

  v_paid_usd := COALESCE(v_topup.price_usd, 0);
  IF v_paid_usd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment amount');
  END IF;

  -- Merge stored intent (preferred for service_role; fallback for user path).
  v_intent := COALESCE(v_topup.helper_application_intent, '{}'::jsonb);
  v_selected_level    := COALESCE(_selected_level, NULLIF((v_intent->>'selected_level')::int, 0), 1);
  v_contact_whatsapp  := COALESCE(NULLIF(_contact_whatsapp, ''), NULLIF(v_intent->>'contact_whatsapp', ''));
  v_contact_telegram  := COALESCE(NULLIF(_contact_telegram, ''), NULLIF(v_intent->>'contact_telegram', ''));
  v_reason            := COALESCE(NULLIF(_reason, ''), NULLIF(v_intent->>'reason', ''));
  v_payroll           := COALESCE(_payroll_requested, (v_intent->>'payroll_requested')::boolean, false);

  -- Service-role calls REQUIRE a stored intent — otherwise this is a plain diamond top-up,
  -- not a helper upgrade, and we must not grant a wallet.
  IF v_is_service AND v_topup.helper_application_intent IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No helper application intent on this topup', 'skipped', true);
  END IF;

  -- Idempotency: if an approved application already exists for this exact topup, return it.
  SELECT id INTO v_existing_id FROM public.helper_applications
   WHERE user_id = v_target_user
     AND payment_transaction_id = _topup_id::text
     AND status = 'approved'
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    SELECT id, trader_level INTO v_helper_id, v_detected_level
      FROM public.topup_helpers WHERE user_id = v_target_user LIMIT 1;
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
    v_detected_level := COALESCE(NULLIF(v_selected_level, 0), 1);
  END IF;

  SELECT COALESCE(NULLIF(country_code, ''), 'BD') INTO v_country
  FROM public.profiles WHERE id = v_target_user LIMIT 1;
  v_country := COALESCE(v_country, 'BD');

  INSERT INTO public.topup_helpers (
    user_id, is_active, is_verified, trader_level, country_code,
    contact_info, approved_at, approved_by, updated_at
  ) VALUES (
    v_target_user, true, true, v_detected_level, v_country,
    jsonb_strip_nulls(jsonb_build_object(
      'whatsapp', NULLIF(v_contact_whatsapp, ''),
      'telegram', NULLIF(v_contact_telegram, '')
    )),
    now(), v_target_user, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_active    = true,
    is_verified  = true,
    trader_level = GREATEST(public.topup_helpers.trader_level, EXCLUDED.trader_level),
    country_code = COALESCE(public.topup_helpers.country_code, EXCLUDED.country_code),
    contact_info = COALESCE(public.topup_helpers.contact_info, '{}'::jsonb) || EXCLUDED.contact_info,
    approved_at  = COALESCE(public.topup_helpers.approved_at, now()),
    approved_by  = COALESCE(public.topup_helpers.approved_by, v_target_user),
    updated_at   = now()
  RETURNING id INTO v_helper_id;

  BEGIN
    INSERT INTO public.helper_applications (
      user_id, agency_id, requested_level, payroll_requested,
      contact_whatsapp, contact_telegram, reason,
      payment_method, payment_details, payment_transaction_id,
      status, reviewed_at, reviewed_by
    ) VALUES (
      v_target_user, NULL, v_detected_level,
      CASE WHEN v_detected_level = 5 THEN COALESCE(v_payroll, false) ELSE false END,
      NULLIF(v_contact_whatsapp, ''), NULLIF(v_contact_telegram, ''), NULLIF(v_reason, ''),
      'MeriCash Crypto Gateway (Auto)',
      jsonb_build_object(
        'method', 'swift_pay_crypto',
        'topup_id', _topup_id,
        'amount_usd', v_paid_usd,
        'selected_level', v_selected_level,
        'detected_level', v_detected_level,
        'auto_verified', true,
        'auto_granted', true,
        'granted_via', CASE WHEN v_is_service THEN 'cron' ELSE 'client' END
      ),
      _topup_id::text,
      'approved', now(), v_target_user
    );
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.helper_applications
       SET status = 'approved',
           reviewed_at = COALESCE(reviewed_at, now()),
           reviewed_by = COALESCE(reviewed_by, v_target_user),
           payment_transaction_id = COALESCE(payment_transaction_id, _topup_id::text)
     WHERE user_id = v_target_user AND payment_transaction_id = _topup_id::text;
  WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'helper_id', v_helper_id,
    'trader_level', v_detected_level,
    'amount_usd', v_paid_usd,
    'granted_via', CASE WHEN v_is_service THEN 'cron' ELSE 'client' END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_grant_helper_from_crypto_payment(uuid, integer, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_grant_helper_from_crypto_payment(uuid, integer, text, text, text, boolean) TO anon, authenticated, service_role;

COMMIT;

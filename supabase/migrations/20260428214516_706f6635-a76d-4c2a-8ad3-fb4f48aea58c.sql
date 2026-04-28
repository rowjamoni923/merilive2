
-- 1) Update existing admin settings to user's policy values
UPDATE app_settings
SET setting_value = jsonb_set(setting_value::jsonb, '{min_withdrawal}', to_jsonb(100000))::text,
    updated_at = now()
WHERE setting_key = 'withdrawal_settings';

UPDATE app_settings
SET setting_value = (
      jsonb_set(setting_value::jsonb, '{min_payout}', to_jsonb(100000))
      || jsonb_build_object('min_usd', 10)
    )::text,
    updated_at = now()
WHERE setting_key = 'agency_commission';

-- 2) Rewrite request_agency_withdrawal with strict admin-driven minimums (no defaults)
CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  p_agency_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'epay'::text,
  p_payment_details jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance NUMERIC;
  v_owner_id uuid;
  v_withdrawal_id UUID;
  v_fee_percent NUMERIC;
  v_helper_commission_percent NUMERIC;
  v_fee_beans NUMERIC;
  v_net_beans NUMERIC;
  v_net_diamonds_to_helper NUMERIC;
  v_beans_per_usd NUMERIC;
  v_net_usd NUMERIC;
  v_min_beans_a NUMERIC;  -- withdrawal_settings.min_withdrawal
  v_min_beans_b NUMERIC;  -- agency_commission.min_payout
  v_min_beans_required NUMERIC;
  v_min_usd NUMERIC;      -- agency_commission.min_usd
  v_fee_text text;
  v_helper_text text;
  v_agency_text text;
  v_withdrawal_text text;
  v_fee_json jsonb;
  v_helper_json jsonb;
  v_agency_json jsonb;
  v_withdrawal_json jsonb;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT owner_id, wallet_balance INTO v_owner_id, v_current_balance
    FROM agencies WHERE id = p_agency_id FOR UPDATE;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', v_current_balance);
  END IF;

  -- ===== Read ALL admin-configured values (NO hardcoded defaults) =====

  -- agency_commission JSON (min_payout, min_usd, coins_to_dollar_rate)
  SELECT setting_value INTO v_agency_text FROM app_settings WHERE setting_key = 'agency_commission';
  BEGIN
    v_agency_json := v_agency_text::jsonb;
    v_beans_per_usd := (v_agency_json->>'coins_to_dollar_rate')::numeric;
    v_min_beans_b   := (v_agency_json->>'min_payout')::numeric;
    v_min_usd       := (v_agency_json->>'min_usd')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_beans_per_usd := NULL; v_min_beans_b := NULL; v_min_usd := NULL;
  END;

  -- withdrawal_settings JSON (min_withdrawal)
  SELECT setting_value INTO v_withdrawal_text FROM app_settings WHERE setting_key = 'withdrawal_settings';
  BEGIN
    v_withdrawal_json := v_withdrawal_text::jsonb;
    v_min_beans_a := (v_withdrawal_json->>'min_withdrawal')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_min_beans_a := NULL;
  END;

  -- Hard requirement: beans→USD rate MUST be set by admin
  IF v_beans_per_usd IS NULL OR v_beans_per_usd <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Beans-to-USD rate not configured. Admin must set app_settings.agency_commission.coins_to_dollar_rate.'
    );
  END IF;

  -- Hard requirement: min beans MUST be set by admin (in BOTH places — take MAX)
  IF v_min_beans_a IS NULL AND v_min_beans_b IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Minimum withdrawal beans not configured. Admin must set withdrawal_settings.min_withdrawal and agency_commission.min_payout.'
    );
  END IF;
  v_min_beans_required := GREATEST(COALESCE(v_min_beans_a, 0), COALESCE(v_min_beans_b, 0));

  -- Hard requirement: min USD MUST be set by admin
  IF v_min_usd IS NULL OR v_min_usd <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Minimum withdrawal USD not configured. Admin must set app_settings.agency_commission.min_usd.'
    );
  END IF;

  -- Enforce: beans minimum
  IF p_amount < v_min_beans_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Minimum withdrawal is %s beans', v_min_beans_required::bigint),
      'min_beans', v_min_beans_required,
      'requested_beans', p_amount
    );
  END IF;

  -- Read fee % from admin settings (treat NULL as 0)
  SELECT setting_value INTO v_fee_text FROM app_settings WHERE setting_key = 'agency_withdrawal_fee';
  BEGIN v_fee_json := v_fee_text::jsonb;
        v_fee_percent := COALESCE((v_fee_json->>'rate')::numeric, (v_fee_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
        BEGIN v_fee_percent := v_fee_text::numeric; EXCEPTION WHEN OTHERS THEN v_fee_percent := NULL; END;
  END;

  -- Read helper commission % from admin settings (treat NULL as 0)
  SELECT setting_value INTO v_helper_text FROM app_settings WHERE setting_key = 'helper_diamond_commission';
  BEGIN v_helper_json := v_helper_text::jsonb;
        v_helper_commission_percent := COALESCE((v_helper_json->>'rate')::numeric, (v_helper_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
        BEGIN v_helper_commission_percent := v_helper_text::numeric; EXCEPTION WHEN OTHERS THEN v_helper_commission_percent := NULL; END;
  END;

  v_fee_percent := COALESCE(v_fee_percent, 0);
  v_helper_commission_percent := COALESCE(v_helper_commission_percent, 0);

  v_fee_beans := FLOOR(p_amount * v_fee_percent / 100.0);
  v_net_beans := p_amount - v_fee_beans;
  v_net_diamonds_to_helper := FLOOR(p_amount * (1 - v_helper_commission_percent / 100.0));
  v_net_usd := ROUND(v_net_beans / v_beans_per_usd, 2);

  -- Enforce: net USD minimum (after fee)
  IF v_net_usd < v_min_usd THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Net withdrawal must be at least $%s USD (currently $%s after fee)', v_min_usd, v_net_usd),
      'min_usd', v_min_usd,
      'net_usd', v_net_usd
    );
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE agencies SET wallet_balance = wallet_balance - p_amount, updated_at = now() WHERE id = p_agency_id;

  INSERT INTO agency_withdrawals (
    agency_id, amount, payment_method, payment_details, notes, status,
    fee_percentage, net_amount_money, net_diamonds_to_helper
  )
  VALUES (
    p_agency_id, p_amount, p_payment_method,
    COALESCE(p_payment_details, '{}'::jsonb)
      || jsonb_build_object(
           'fee_percent', v_fee_percent, 'fee_beans', v_fee_beans,
           'net_withdrawal_beans', v_net_beans, 'net_withdrawal_usd', v_net_usd,
           'beans_per_usd', v_beans_per_usd,
           'helper_commission_percent', v_helper_commission_percent,
           'min_beans_enforced', v_min_beans_required,
           'min_usd_enforced', v_min_usd
         ),
    p_notes, 'pending',
    v_fee_percent, v_net_usd, v_net_diamonds_to_helper
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'success', true, 'withdrawal_id', v_withdrawal_id,
    'amount_beans', p_amount, 'fee_percent', v_fee_percent, 'fee_beans', v_fee_beans,
    'net_beans', v_net_beans, 'net_usd', v_net_usd,
    'net_diamonds_to_helper', v_net_diamonds_to_helper, 'beans_per_usd', v_beans_per_usd
  );
END;
$function$;

-- Pkg382: ePay removed; auto-withdrawal is SwiftPay (MeriCash) only.
CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  p_agency_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'crypto_auto'::text,
  p_payment_details jsonb DEFAULT '{}'::jsonb,
  p_notes text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_balance numeric;
  v_owner_id uuid;
  v_withdrawal_id uuid;
  v_fee_percent numeric;
  v_effective_fee_percent numeric;
  v_helper_commission_percent numeric;
  v_fee_beans numeric;
  v_net_beans numeric;
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
  v_country text;
  v_currency text;
  v_usd numeric;
  v_rate numeric;
  v_pm_type text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  v_method := lower(trim(COALESCE(p_payment_method, '')));
  IF v_method = '' OR length(v_method) > 40 OR v_method !~ '^[a-z0-9_]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method');
  END IF;

  -- Pkg382: ePay/Binance auto-gateways have been removed.
  -- Reject any attempt to use them so stale clients cannot create unprocessable rows.
  IF v_method IN ('epay', 'binance') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This payment method is no longer supported. Please use MeriCash (USDT TRC20) or a local helper method.'
    );
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
  v_net_usd := ROUND(v_net_beans / v_beans_per_usd, 2);

  IF v_net_usd < v_min_usd THEN
    RETURN jsonb_build_object('success', false,
      'error', format('Net withdrawal must be at least $%s USD (currently $%s after fee)', v_min_usd, v_net_usd),
      'min_usd', v_min_usd, 'net_usd', v_net_usd);
  END IF;

  v_country := upper(left(regexp_replace(COALESCE(v_details->>'country_code',''), '[^A-Za-z]', '', 'g'), 8));
  IF v_country = '' THEN v_country := NULL; END IF;
  v_currency := upper(left(regexp_replace(COALESCE(v_details->>'currency_code',''), '[^A-Za-z]', '', 'g'), 8));
  IF v_currency = '' THEN v_currency := NULL; END IF;
  BEGIN v_usd := (v_details->>'usd_amount')::numeric; EXCEPTION WHEN OTHERS THEN v_usd := v_net_usd; END;
  BEGIN v_rate := (v_details->>'exchange_rate')::numeric; EXCEPTION WHEN OTHERS THEN v_rate := NULL; END;

  -- Pkg382: only SwiftPay USDT TRC20 paths are "auto" now.
  v_pm_type := CASE
    WHEN v_method IN ('crypto_auto','usdt','usdttrc20') THEN 'auto'
    ELSE 'manual'
  END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);

  UPDATE public.agencies
  SET wallet_balance = wallet_balance - p_amount, updated_at = now()
  WHERE id = p_agency_id;

  INSERT INTO public.agency_withdrawals (
    agency_id, amount, payment_method, payment_details, notes, status,
    fee_percentage, net_amount_money, net_diamonds_to_helper,
    country_code, currency, usd_amount, exchange_rate, payment_method_type
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
    v_effective_fee_percent, v_net_usd,
    0,
    v_country, v_currency, COALESCE(v_usd, v_net_usd), v_rate, v_pm_type
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
    'net_diamonds_to_helper', 0,
    'beans_per_usd', v_beans_per_usd,
    'country_code', v_country
  );
END;
$function$;

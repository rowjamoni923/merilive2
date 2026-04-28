
-- =====================================================
-- Pkg28: Remove all remaining hardcoded financial defaults
-- =====================================================

-- 1) get_effective_host_percent: NO hardcoded 50% fallback
CREATE OR REPLACE FUNCTION public.get_effective_host_percent()
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ((setting_value::jsonb)->>'host_percent')::numeric
  FROM app_settings
  WHERE setting_key = 'gift_commission'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_effective_host_percent IS
'Pkg28: 100% admin-driven. Returns NULL if app_settings.gift_commission.host_percent is not configured. Callers must handle NULL.';

-- 2) request_agency_withdrawal: NO hardcoded 9000 beans/USD fallback
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
SET search_path = public
AS $$
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
  v_fee_text text;
  v_helper_text text;
  v_agency_text text;
  v_fee_json jsonb;
  v_helper_json jsonb;
  v_agency_json jsonb;
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

  -- Read fee % from admin settings (NULL if not configured)
  SELECT setting_value INTO v_fee_text FROM app_settings WHERE setting_key = 'agency_withdrawal_fee';
  BEGIN v_fee_json := v_fee_text::jsonb;
        v_fee_percent := COALESCE((v_fee_json->>'rate')::numeric, (v_fee_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
        BEGIN v_fee_percent := v_fee_text::numeric; EXCEPTION WHEN OTHERS THEN v_fee_percent := NULL; END;
  END;

  -- Read helper commission % from admin settings (NULL if not configured)
  SELECT setting_value INTO v_helper_text FROM app_settings WHERE setting_key = 'helper_diamond_commission';
  BEGIN v_helper_json := v_helper_text::jsonb;
        v_helper_commission_percent := COALESCE((v_helper_json->>'rate')::numeric, (v_helper_json->>'percent')::numeric);
  EXCEPTION WHEN OTHERS THEN
        BEGIN v_helper_commission_percent := v_helper_text::numeric; EXCEPTION WHEN OTHERS THEN v_helper_commission_percent := NULL; END;
  END;

  -- Read beans→USD rate from admin settings (NO hardcoded 9000)
  SELECT setting_value INTO v_agency_text FROM app_settings WHERE setting_key = 'agency_commission';
  BEGIN v_agency_json := v_agency_text::jsonb;
        v_beans_per_usd := (v_agency_json->>'coins_to_dollar_rate')::numeric;
  EXCEPTION WHEN OTHERS THEN v_beans_per_usd := NULL; END;

  -- Hard requirement: beans→USD rate MUST be set by admin
  IF v_beans_per_usd IS NULL OR v_beans_per_usd <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Beans-to-USD rate not configured. Admin must set app_settings.agency_commission.coins_to_dollar_rate.'
    );
  END IF;

  -- Treat NULL settings as 0 (no fee, no helper commission) — admin-controlled
  v_fee_percent := COALESCE(v_fee_percent, 0);
  v_helper_commission_percent := COALESCE(v_helper_commission_percent, 0);

  v_fee_beans := FLOOR(p_amount * v_fee_percent / 100.0);
  v_net_beans := p_amount - v_fee_beans;
  v_net_diamonds_to_helper := FLOOR(p_amount * (1 - v_helper_commission_percent / 100.0));
  v_net_usd := ROUND(v_net_beans / v_beans_per_usd, 2);

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
           'helper_commission_percent', v_helper_commission_percent
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
$$;

COMMENT ON FUNCTION public.request_agency_withdrawal IS
'Pkg28: 100% admin-driven. NO hardcoded 9000 beans/USD. Returns error if rate not configured.';

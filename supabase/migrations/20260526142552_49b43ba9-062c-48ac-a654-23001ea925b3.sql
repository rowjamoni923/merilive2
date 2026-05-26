
-- Pkg370: separate user vs agency beans→diamonds exchange settings
-- User: 4 beans = 1 diamond, 0% fee (already in coin_exchange)
-- Agency: 4 beans = 1 diamond, 25% fee (new agency_coin_exchange)

INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'agency_coin_exchange',
  jsonb_build_object('beans_to_diamonds_rate', 4, 'exchange_fee_percent', 25, 'min_exchange_amount', 100000),
  'Agency beans → diamonds exchange (rate, fee %, min beans)'
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = jsonb_build_object('beans_to_diamonds_rate', 4, 'exchange_fee_percent', 25, 'min_exchange_amount', 100000);

-- Make sure user side keeps 0% fee, 4:1
UPDATE public.app_settings
SET setting_value = jsonb_build_object('beans_to_diamonds_rate', 4, 'exchange_fee_percent', 0, 'min_exchange_amount', 100000)
WHERE setting_key = 'coin_exchange';

-- Fix agency RPC: use agency_coin_exchange + divide by rate (matches UI), keep fee deducted from diamonds
CREATE OR REPLACE FUNCTION public.exchange_agency_beans_to_diamonds(p_agency_id uuid, p_beans_to_deduct bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_service boolean := current_setting('request.jwt.claim.role', true) = 'service_role';
  v_owner_id uuid;
  v_current_beans bigint;
  v_current_diamonds bigint;
  v_new_beans bigint;
  v_new_diamonds bigint;
  v_rate numeric;
  v_fee_pct numeric;
  v_min_exchange bigint;
  v_settings jsonb;
  v_gross_diamonds bigint;
  v_fee_diamonds bigint;
  v_net_diamonds bigint;
BEGIN
  IF p_beans_to_deduct IS NULL OR p_beans_to_deduct <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  SELECT owner_id, COALESCE(beans_balance, 0)::bigint, COALESCE(diamond_balance, 0)::bigint
    INTO v_owner_id, v_current_beans, v_current_diamonds
  FROM public.agencies WHERE id = p_agency_id FOR UPDATE;
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  IF NOT (v_is_service
          OR (v_caller IS NOT NULL AND v_caller = v_owner_id)
          OR (v_caller IS NOT NULL AND public.is_admin(v_caller))) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF v_current_beans < p_beans_to_deduct THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient beans balance',
                              'current_beans', v_current_beans, 'required_beans', p_beans_to_deduct);
  END IF;

  -- Prefer agency_coin_exchange, fall back to coin_exchange
  SELECT setting_value INTO v_settings FROM public.app_settings WHERE setting_key = 'agency_coin_exchange' LIMIT 1;
  IF v_settings IS NULL THEN
    SELECT setting_value INTO v_settings FROM public.app_settings WHERE setting_key = 'coin_exchange' LIMIT 1;
  END IF;
  v_rate         := COALESCE(NULLIF((v_settings->>'beans_to_diamonds_rate'),'')::numeric, 4);
  v_fee_pct      := COALESCE(NULLIF((v_settings->>'exchange_fee_percent'),'')::numeric, 25);
  v_min_exchange := COALESCE(NULLIF((v_settings->>'min_exchange_amount'),'')::bigint, 0);

  IF v_rate <= 0 THEN v_rate := 4; END IF;

  IF v_min_exchange > 0 AND p_beans_to_deduct < v_min_exchange THEN
    RETURN jsonb_build_object('success', false, 'error', 'Below minimum exchange amount',
                              'min_required', v_min_exchange);
  END IF;

  -- Beans / rate → gross diamonds; then deduct fee % from diamonds
  v_gross_diamonds := FLOOR(p_beans_to_deduct::numeric / v_rate)::bigint;
  v_fee_diamonds   := FLOOR(v_gross_diamonds::numeric * v_fee_pct / 100.0)::bigint;
  v_net_diamonds   := GREATEST(v_gross_diamonds - v_fee_diamonds, 0);

  v_new_beans    := v_current_beans - p_beans_to_deduct;
  v_new_diamonds := v_current_diamonds + v_net_diamonds;

  UPDATE public.agencies
     SET beans_balance = v_new_beans, diamond_balance = v_new_diamonds, updated_at = now()
   WHERE id = p_agency_id;

  INSERT INTO public.agency_diamond_transactions
    (agency_id, transaction_type, beans_amount, diamond_amount, fee_amount)
  VALUES
    (p_agency_id, 'exchange', p_beans_to_deduct, v_net_diamonds, v_fee_diamonds);

  RETURN jsonb_build_object(
    'success', true,
    'old_beans', v_current_beans,
    'new_beans', v_new_beans,
    'old_diamonds', v_current_diamonds,
    'new_diamonds', v_new_diamonds,
    'deducted_beans', p_beans_to_deduct,
    'added_diamonds', v_net_diamonds,
    'fee_diamonds', v_fee_diamonds,
    'rate', v_rate,
    'fee_percent', v_fee_pct
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.exchange_agency_beans_to_diamonds(uuid, bigint) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.exchange_agency_beans_to_diamonds(uuid, bigint) TO authenticated;

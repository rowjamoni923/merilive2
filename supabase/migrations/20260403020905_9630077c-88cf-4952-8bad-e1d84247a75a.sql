CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  _agency_id UUID,
  _amount BIGINT,
  _payment_method TEXT,
  _payment_details JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _beans_balance NUMERIC;
  _wallet_balance NUMERIC;
  _calculated_balance NUMERIC;
  _total_withdrawn NUMERIC;
  _effective_balance NUMERIC;
  _withdrawal_id UUID;
  _country_code TEXT;
  _currency_code TEXT;
  _local_amount NUMERIC;
  _owner_id UUID;
  _account_name TEXT;
  _account_number TEXT;
BEGIN
  SELECT owner_id INTO _owner_id FROM public.agencies WHERE id = _agency_id;
  IF auth.uid() IS NULL OR auth.uid() != _owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only agency owner can request withdrawal');
  END IF;

  SELECT COALESCE(beans_balance, 0), COALESCE(wallet_balance, 0)
  INTO _beans_balance, _wallet_balance
  FROM public.agencies
  WHERE id = _agency_id;

  IF _beans_balance IS NULL AND _wallet_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  _account_name := regexp_replace(btrim(COALESCE(_payment_details->>'account_name', '')), '\s+', ' ', 'g');
  _account_number := regexp_replace(btrim(COALESCE(_payment_details->>'account_number', '')), '\s+', '', 'g');
  _country_code := upper(btrim(COALESCE(_payment_details->>'country_code', '')));
  _currency_code := upper(btrim(COALESCE(_payment_details->>'currency_code', '')));
  _local_amount := COALESCE((_payment_details->>'local_amount')::NUMERIC, 0);

  IF _amount <= 0 OR _local_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid withdrawal amount');
  END IF;

  IF _account_name = '' OR length(_account_name) < 2 OR length(_account_name) > 80 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid account name');
  END IF;

  IF _payment_method = 'epay' THEN
    IF _account_number = '' OR _account_number !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'ePay account must be a valid email address');
    END IF;
  ELSIF _payment_method = 'upi' THEN
    IF _account_number = '' OR _account_number !~* '^[A-Z0-9._-]{2,}@[A-Z]{2,}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'UPI account must be a valid UPI ID');
    END IF;
  ELSIF _payment_method = 'alipay' THEN
    IF _account_number = '' OR _account_number !~* '(^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$)|(^[0-9]{8,20}$)' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Alipay account must be a valid email or phone/account number');
    END IF;
  ELSE
    IF _account_number = '' OR _account_number !~ '^[0-9]{8,20}$' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Enter a valid wallet/account number');
    END IF;
  END IF;

  IF _country_code = 'BD' AND _payment_method NOT IN ('bkash', 'nagad', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Bangladesh');
  ELSIF _country_code = 'IN' AND _payment_method NOT IN ('upi', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for India');
  ELSIF _country_code = 'PK' AND _payment_method NOT IN ('easypaisa', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Pakistan');
  ELSIF _country_code = 'NP' AND _payment_method NOT IN ('esewa', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Nepal');
  ELSIF _country_code = 'LK' AND _payment_method NOT IN ('frimi', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Sri Lanka');
  ELSIF _country_code = 'PH' AND _payment_method NOT IN ('gcash', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Philippines');
  ELSIF _country_code = 'ID' AND _payment_method NOT IN ('gopay', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Indonesia');
  ELSIF _country_code = 'VN' AND _payment_method NOT IN ('momo', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Vietnam');
  ELSIF _country_code = 'TH' AND _payment_method NOT IN ('promptpay', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Thailand');
  ELSIF _country_code = 'MY' AND _payment_method NOT IN ('grabpay', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Malaysia');
  ELSIF _country_code = 'SG' AND _payment_method NOT IN ('paynow', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Singapore');
  ELSIF _country_code = 'JP' AND _payment_method NOT IN ('paypay', 'epay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Japan');
  ELSIF _country_code = 'KR' AND _payment_method NOT IN ('kakaopay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for South Korea');
  ELSIF _country_code = 'CN' AND _payment_method NOT IN ('alipay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for China');
  ELSIF _country_code = 'HK' AND _payment_method NOT IN ('payme') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Hong Kong');
  ELSIF _country_code = 'TW' AND _payment_method NOT IN ('linepay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Taiwan');
  ELSIF _country_code = 'MM' AND _payment_method NOT IN ('wavepay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Myanmar');
  ELSIF _country_code = 'KH' AND _payment_method NOT IN ('wing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Cambodia');
  ELSIF _country_code = 'LA' AND _payment_method NOT IN ('bcel') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Laos');
  ELSIF _country_code = 'BN' AND _payment_method NOT IN ('progresifpay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Brunei');
  ELSIF _country_code = 'MN' AND _payment_method NOT IN ('qpay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Mongolia');
  ELSIF _country_code = 'KZ' AND _payment_method NOT IN ('kaspi') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Kazakhstan');
  ELSIF _country_code = 'UZ' AND _payment_method NOT IN ('payme') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Uzbekistan');
  ELSIF _country_code = 'AZ' AND _payment_method NOT IN ('mpay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Azerbaijan');
  ELSIF _country_code = 'GE' AND _payment_method NOT IN ('tbcpay') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment method for Georgia');
  END IF;

  SELECT COALESCE(SUM(COALESCE(gift_earnings, 0) + COALESCE(amount, 0)), 0)
  INTO _calculated_balance
  FROM public.agency_earnings_transfers
  WHERE agency_id = _agency_id;

  SELECT COALESCE(SUM(amount), 0)
  INTO _total_withdrawn
  FROM public.agency_withdrawals
  WHERE agency_id = _agency_id
    AND status IN ('pending', 'processing', 'approved', 'completed');

  _effective_balance := GREATEST(
    COALESCE(_wallet_balance, 0),
    COALESCE(_beans_balance, 0),
    COALESCE(_calculated_balance - _total_withdrawn, 0),
    0
  );

  IF _effective_balance < _amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance',
      'available_balance', _effective_balance,
      'requested_amount', _amount,
      'total_earnings', _calculated_balance,
      'total_withdrawn', _total_withdrawn,
      'beans_balance', _beans_balance,
      'wallet_balance', _wallet_balance
    );
  END IF;

  INSERT INTO public.agency_withdrawals (
    agency_id,
    amount,
    status,
    payment_method,
    payment_details,
    country_code,
    currency_code,
    local_currency_amount
  ) VALUES (
    _agency_id,
    _amount,
    'pending',
    _payment_method,
    _payment_details,
    _country_code,
    _currency_code,
    _local_amount
  ) RETURNING id INTO _withdrawal_id;

  UPDATE public.agencies
  SET beans_balance = GREATEST(COALESCE(beans_balance, 0) - _amount, 0),
      wallet_balance = GREATEST(COALESCE(wallet_balance, 0) - _amount, 0),
      updated_at = NOW()
  WHERE id = _agency_id;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'amount', _amount,
    'effective_balance', _effective_balance,
    'new_available_balance', _effective_balance - _amount,
    'local_amount', _local_amount,
    'currency_code', _currency_code,
    'country_code', _country_code
  );
END;
$$;
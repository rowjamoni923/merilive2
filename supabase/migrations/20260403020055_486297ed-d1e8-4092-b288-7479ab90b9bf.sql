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
BEGIN
  SELECT owner_id INTO _owner_id FROM agencies WHERE id = _agency_id;
  IF auth.uid() IS NULL OR auth.uid() != _owner_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Only agency owner can request withdrawal');
  END IF;

  SELECT COALESCE(beans_balance, 0), COALESCE(wallet_balance, 0)
  INTO _beans_balance, _wallet_balance
  FROM agencies WHERE id = _agency_id;

  IF _beans_balance IS NULL AND _wallet_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  SELECT COALESCE(SUM(COALESCE(gift_earnings, 0) + COALESCE(amount, 0)), 0)
  INTO _calculated_balance FROM agency_earnings_transfers WHERE agency_id = _agency_id;

  SELECT COALESCE(SUM(amount), 0) INTO _total_withdrawn
  FROM agency_withdrawals WHERE agency_id = _agency_id AND status IN ('pending', 'processing', 'approved', 'completed');

  _effective_balance := GREATEST(
    _wallet_balance,
    _beans_balance,
    _calculated_balance - _total_withdrawn,
    0
  );

  IF _effective_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance',
      'available_balance', _effective_balance, 'requested_amount', _amount,
      'total_earnings', _calculated_balance, 'total_withdrawn', _total_withdrawn,
      'beans_balance', _beans_balance, 'wallet_balance', _wallet_balance);
  END IF;

  _country_code := _payment_details->>'country_code';
  _currency_code := _payment_details->>'currency_code';
  _local_amount := COALESCE((_payment_details->>'local_amount')::NUMERIC, 0);

  INSERT INTO agency_withdrawals (
    agency_id, amount, status, payment_method, payment_details,
    country_code, currency_code, local_currency_amount
  ) VALUES (
    _agency_id, _amount, 'pending', _payment_method, _payment_details,
    _country_code, _currency_code, _local_amount
  ) RETURNING id INTO _withdrawal_id;

  UPDATE agencies SET
    beans_balance = GREATEST(COALESCE(beans_balance, 0) - _amount, 0),
    wallet_balance = GREATEST(COALESCE(wallet_balance, 0) - _amount, 0),
    updated_at = NOW()
  WHERE id = _agency_id;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', _withdrawal_id,
    'amount', _amount, 'effective_balance', _effective_balance,
    'new_available_balance', _effective_balance - _amount,
    'local_amount', _local_amount, 'currency_code', _currency_code, 'country_code', _country_code);
END;
$$;
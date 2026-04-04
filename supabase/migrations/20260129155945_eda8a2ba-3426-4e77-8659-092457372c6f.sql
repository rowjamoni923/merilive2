-- Fix request_agency_withdrawal to subtract existing withdrawals from available balance
-- This ensures agencies cannot withdraw more than their actual remaining balance

DROP FUNCTION IF EXISTS public.request_agency_withdrawal(UUID, NUMERIC, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  _agency_id UUID,
  _amount NUMERIC,
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
  _calculated_balance NUMERIC;
  _total_withdrawn NUMERIC;
  _effective_balance NUMERIC;
  _withdrawal_id UUID;
  _country_code TEXT;
  _currency_code TEXT;
  _local_amount NUMERIC;
BEGIN
  -- Get current agency beans_balance
  SELECT COALESCE(beans_balance, 0) INTO _beans_balance
  FROM agencies WHERE id = _agency_id;
  
  -- Check if agency exists
  IF _beans_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agency not found');
  END IF;
  
  -- Calculate balance from earnings transfers (SAME LOGIC AS DASHBOARD)
  -- Dashboard Total Beans = sum of gift_earnings + sum of amount (agency commission)
  SELECT COALESCE(SUM(COALESCE(gift_earnings, 0) + COALESCE(amount, 0)), 0)
  INTO _calculated_balance
  FROM agency_earnings_transfers
  WHERE agency_id = _agency_id;
  
  -- IMPORTANT: Calculate total already withdrawn (pending, processing, approved, completed)
  -- These amounts are already locked/spent and should not be available
  SELECT COALESCE(SUM(amount), 0)
  INTO _total_withdrawn
  FROM agency_withdrawals
  WHERE agency_id = _agency_id
    AND status IN ('pending', 'processing', 'approved', 'completed');
  
  -- Available balance = Total Earnings - Total Already Withdrawn
  _effective_balance := GREATEST(_calculated_balance - _total_withdrawn, 0);
  
  -- Check if balance is sufficient for new withdrawal
  IF _effective_balance < _amount THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Insufficient balance',
      'available_balance', _effective_balance,
      'requested_amount', _amount,
      'total_earnings', _calculated_balance,
      'total_withdrawn', _total_withdrawn
    );
  END IF;
  
  -- Extract payment details
  _country_code := _payment_details->>'country_code';
  _currency_code := _payment_details->>'currency_code';
  _local_amount := COALESCE((_payment_details->>'local_amount')::NUMERIC, 0);
  
  -- Create withdrawal request
  INSERT INTO agency_withdrawals (
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
  )
  RETURNING id INTO _withdrawal_id;
  
  -- Update agency beans_balance for tracking
  UPDATE agencies 
  SET beans_balance = beans_balance - _amount,
      updated_at = NOW()
  WHERE id = _agency_id;
  
  RETURN json_build_object(
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
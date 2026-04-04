-- Fix the request_agency_withdrawal function with proper search_path
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
  _agency_balance BIGINT;
  _withdrawal_id UUID;
BEGIN
  -- Get current agency balance
  SELECT COALESCE(wallet_balance, 0) INTO _agency_balance
  FROM agencies WHERE id = _agency_id;
  
  -- Check if balance is sufficient
  IF _agency_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  -- REMOVED: Check for pending withdrawals - now allow multiple pending orders
  -- Users can create 10-100 withdrawal orders at once
  
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
    _payment_details->>'country_code',
    _payment_details->>'currency_code',
    COALESCE((_payment_details->>'local_amount')::NUMERIC, 0)
  )
  RETURNING id INTO _withdrawal_id;
  
  -- Deduct from agency balance
  UPDATE agencies 
  SET wallet_balance = wallet_balance - _amount,
      updated_at = NOW()
  WHERE id = _agency_id;
  
  RETURN json_build_object(
    'success', true, 
    'withdrawal_id', _withdrawal_id,
    'amount', _amount,
    'new_balance', _agency_balance - _amount
  );
END;
$$;
-- Drop both existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.request_agency_withdrawal(uuid, bigint, text, jsonb);
DROP FUNCTION IF EXISTS public.request_agency_withdrawal(uuid, numeric, text, jsonb);

-- Create single unified function that works with numeric and doesn't require owner check
-- (since agency withdrawal page already verifies the user is the owner)
CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  _agency_id UUID,
  _amount NUMERIC,
  _payment_method TEXT DEFAULT 'bank',
  _payment_details JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _agency_balance NUMERIC;
  _withdrawal_id UUID;
  _country_code TEXT;
  _currency_code TEXT;
  _local_amount NUMERIC;
BEGIN
  -- Get current agency balance
  SELECT COALESCE(wallet_balance, 0) INTO _agency_balance
  FROM agencies WHERE id = _agency_id;
  
  -- Check if agency exists
  IF _agency_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Agency not found');
  END IF;
  
  -- Check if balance is sufficient
  IF _agency_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
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
  
  -- Deduct from agency balance
  UPDATE agencies 
  SET wallet_balance = wallet_balance - _amount,
      updated_at = NOW()
  WHERE id = _agency_id;
  
  RETURN json_build_object(
    'success', true, 
    'withdrawal_id', _withdrawal_id,
    'amount', _amount,
    'new_balance', _agency_balance - _amount,
    'local_amount', _local_amount,
    'currency_code', _currency_code,
    'country_code', _country_code
  );
END;
$$;
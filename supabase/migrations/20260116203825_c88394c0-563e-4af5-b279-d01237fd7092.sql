-- Drop existing function to avoid conflict
DROP FUNCTION IF EXISTS public.request_agency_withdrawal(UUID, NUMERIC, TEXT, JSONB);

-- Recreate with proper fields
CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  _agency_id UUID,
  _amount NUMERIC,
  _payment_method TEXT DEFAULT 'bank',
  _payment_details JSONB DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency RECORD;
  _withdrawal_id UUID;
  _country_code TEXT;
  _currency_code TEXT;
  _local_amount NUMERIC;
BEGIN
  -- Check if user owns this agency
  SELECT * INTO _agency
  FROM agencies
  WHERE id = _agency_id AND owner_id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Agency not found or not authorized');
  END IF;
  
  -- Check if agency has enough balance
  IF COALESCE(_agency.wallet_balance, 0) < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  -- Extract payment details
  _country_code := _payment_details->>'country_code';
  _currency_code := _payment_details->>'currency_code';
  _local_amount := COALESCE((_payment_details->>'local_amount')::NUMERIC, 0);
  
  -- Create withdrawal request with all fields
  INSERT INTO agency_withdrawals (
    agency_id, 
    amount, 
    payment_method, 
    payment_details, 
    status,
    country_code,
    currency_code,
    local_currency_amount
  ) VALUES (
    _agency_id, 
    _amount, 
    _payment_method, 
    _payment_details, 
    'pending',
    _country_code,
    _currency_code,
    _local_amount
  ) RETURNING id INTO _withdrawal_id;
  
  -- Deduct from agency wallet
  UPDATE agencies
  SET wallet_balance = wallet_balance - _amount,
      updated_at = NOW()
  WHERE id = _agency_id;
  
  RETURN json_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'amount', _amount,
    'local_amount', _local_amount,
    'currency_code', _currency_code,
    'country_code', _country_code
  );
END;
$$;
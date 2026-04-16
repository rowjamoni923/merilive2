-- Fix request_agency_withdrawal to use wallet_balance (Dashboard source of truth)
-- instead of beans_balance which is always 0

CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  _agency_id uuid,
  _amount numeric,
  _payment_method text DEFAULT 'bank_transfer',
  _payment_details jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance numeric;
  _withdrawal_id uuid;
  _platform_fee numeric;
  _net_amount numeric;
BEGIN
  -- Use wallet_balance as the source of truth (same as Agency Dashboard)
  SELECT COALESCE(wallet_balance, 0) INTO _current_balance FROM agencies WHERE id = _agency_id;
  
  IF _current_balance IS NULL OR _current_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  _platform_fee := ROUND(_amount * 0.05, 0);
  _net_amount := _amount - _platform_fee;
  
  -- Deduct from wallet_balance
  UPDATE agencies SET wallet_balance = COALESCE(wallet_balance, 0) - _amount WHERE id = _agency_id;
  
  INSERT INTO agency_withdrawals (agency_id, amount, payment_method, payment_details, status)
  VALUES (_agency_id, _amount, _payment_method, _payment_details || jsonb_build_object('platform_fee', _platform_fee, 'net_withdrawal_beans', _net_amount), 'pending')
  RETURNING id INTO _withdrawal_id;
  
  RETURN jsonb_build_object('success', true, 'withdrawal_id', _withdrawal_id, 'amount', _amount, 'fee', _platform_fee, 'net', _net_amount);
END;
$$;
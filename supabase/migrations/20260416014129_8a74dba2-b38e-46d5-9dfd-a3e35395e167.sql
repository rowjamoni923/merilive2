
-- Fix: request_agency_withdrawal RPC to use wallet_balance instead of beans_balance
CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  p_agency_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'epay',
  p_payment_details JSONB DEFAULT '{}'::jsonb,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_withdrawal_id UUID;
BEGIN
  -- Get current wallet_balance (source of truth)
  SELECT wallet_balance INTO v_current_balance
  FROM agencies
  WHERE id = p_agency_id;

  IF v_current_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', v_current_balance);
  END IF;

  -- Deduct from wallet_balance
  UPDATE agencies
  SET wallet_balance = wallet_balance - p_amount,
      updated_at = now()
  WHERE id = p_agency_id;

  -- Create withdrawal record
  INSERT INTO agency_withdrawals (agency_id, amount, payment_method, payment_details, notes, status)
  VALUES (p_agency_id, p_amount, p_payment_method, p_payment_details, p_notes, 'pending')
  RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_withdrawal_id, 'new_balance', v_current_balance - p_amount);
END;
$$;

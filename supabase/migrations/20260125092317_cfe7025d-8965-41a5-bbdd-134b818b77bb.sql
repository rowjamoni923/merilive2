-- Create a secure function to exchange agency beans to diamonds
-- This ensures atomic operation and prevents race conditions
CREATE OR REPLACE FUNCTION public.exchange_agency_beans_to_diamonds(
  p_agency_id uuid,
  p_beans_to_deduct numeric,
  p_diamonds_to_add numeric,
  p_fee_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_beans numeric;
  v_current_diamonds numeric;
  v_new_beans numeric;
  v_new_diamonds numeric;
BEGIN
  -- Get current balances with row lock
  SELECT beans_balance, diamond_balance 
  INTO v_current_beans, v_current_diamonds
  FROM agencies 
  WHERE id = p_agency_id
  FOR UPDATE;
  
  -- Check if agency exists
  IF v_current_beans IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;
  
  -- Check sufficient balance
  IF COALESCE(v_current_beans, 0) < p_beans_to_deduct THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Insufficient beans balance',
      'current_beans', v_current_beans,
      'required_beans', p_beans_to_deduct
    );
  END IF;
  
  -- Calculate new balances
  v_new_beans := COALESCE(v_current_beans, 0) - p_beans_to_deduct;
  v_new_diamonds := COALESCE(v_current_diamonds, 0) + p_diamonds_to_add;
  
  -- Update agency balances
  UPDATE agencies 
  SET 
    beans_balance = v_new_beans,
    diamond_balance = v_new_diamonds,
    updated_at = now()
  WHERE id = p_agency_id;
  
  -- Record transaction
  INSERT INTO agency_diamond_transactions (
    agency_id,
    transaction_type,
    beans_amount,
    diamond_amount,
    fee_amount
  ) VALUES (
    p_agency_id,
    'exchange',
    p_beans_to_deduct,
    p_diamonds_to_add,
    p_fee_amount
  );
  
  -- Return success with new balances
  RETURN jsonb_build_object(
    'success', true,
    'old_beans', v_current_beans,
    'new_beans', v_new_beans,
    'old_diamonds', v_current_diamonds,
    'new_diamonds', v_new_diamonds,
    'deducted', p_beans_to_deduct,
    'added', p_diamonds_to_add
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.exchange_agency_beans_to_diamonds(uuid, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_agency_beans_to_diamonds(uuid, numeric, numeric, numeric) TO service_role;
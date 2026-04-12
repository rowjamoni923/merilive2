CREATE OR REPLACE FUNCTION public.deduct_helper_wallet(
  _helper_id uuid,
  _amount numeric,
  _update_total_sold boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_bal numeric;
  helper_user_id uuid;
  agency_bal numeric;
  agency_id_val uuid;
  remaining numeric;
  wallet_deducted numeric := 0;
  agency_deducted numeric := 0;
BEGIN
  -- Get helper data
  SELECT wallet_balance, user_id INTO current_bal, helper_user_id 
  FROM topup_helpers WHERE id = _helper_id FOR UPDATE;
  
  IF current_bal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found');
  END IF;

  remaining := _amount;

  -- Step 1: Try deducting from wallet balance first
  IF current_bal > 0 THEN
    IF current_bal >= remaining THEN
      wallet_deducted := remaining;
      remaining := 0;
    ELSE
      wallet_deducted := current_bal;
      remaining := remaining - current_bal;
    END IF;
    
    UPDATE topup_helpers 
    SET wallet_balance = wallet_balance - wallet_deducted, updated_at = now() 
    WHERE id = _helper_id;
  END IF;

  -- Step 2: If still remaining, try agency diamond balance
  IF remaining > 0 THEN
    SELECT a.id, a.diamond_balance INTO agency_id_val, agency_bal
    FROM agencies a WHERE a.owner_id = helper_user_id FOR UPDATE;
    
    IF agency_id_val IS NOT NULL AND agency_bal >= remaining THEN
      agency_deducted := remaining;
      remaining := 0;
      UPDATE agencies SET diamond_balance = diamond_balance - agency_deducted, updated_at = now() WHERE id = agency_id_val;
    ELSIF agency_id_val IS NOT NULL AND agency_bal > 0 THEN
      agency_deducted := agency_bal;
      remaining := remaining - agency_bal;
      UPDATE agencies SET diamond_balance = 0, updated_at = now() WHERE id = agency_id_val;
    END IF;
  END IF;

  -- If still remaining, insufficient balance — rollback partial deductions
  IF remaining > 0 THEN
    IF wallet_deducted > 0 THEN
      UPDATE topup_helpers SET wallet_balance = wallet_balance + wallet_deducted WHERE id = _helper_id;
    END IF;
    IF agency_deducted > 0 THEN
      UPDATE agencies SET diamond_balance = diamond_balance + agency_deducted WHERE id = agency_id_val;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', current_bal, 'agency_balance', COALESCE(agency_bal, 0));
  END IF;

  -- Update total_sold if requested
  IF _update_total_sold THEN
    UPDATE topup_helpers SET total_sold = COALESCE(total_sold, 0) + _amount WHERE id = _helper_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'new_balance', current_bal - wallet_deducted,
    'wallet_deducted', wallet_deducted,
    'agency_deducted', agency_deducted
  );
END;
$$;
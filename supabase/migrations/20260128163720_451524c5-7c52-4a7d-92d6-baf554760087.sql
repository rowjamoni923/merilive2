-- Create function to auto-assign withdrawal to country-specific helper
CREATE OR REPLACE FUNCTION public.auto_assign_withdrawal_helper()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_id UUID;
  _country_code TEXT;
BEGIN
  -- Get the country code from the new withdrawal
  _country_code := NEW.country_code;
  
  -- If no country code, try to get from payment_details
  IF _country_code IS NULL THEN
    _country_code := NEW.payment_details->>'country_code';
  END IF;
  
  -- Skip if no country code
  IF _country_code IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Find an available helper for this country with payroll enabled
  -- Priority: 
  -- 1. Helper's country_code matches
  -- 2. Helper's supported_countries includes the user's country
  -- 3. Helper has payroll_enabled = true
  -- 4. Helper wallet_balance >= 300000 (3 Lakh minimum)
  -- 5. Order by wallet_balance DESC to assign to most capable helper
  SELECT id INTO _helper_id
  FROM topup_helpers
  WHERE is_active = TRUE
    AND is_verified = TRUE
    AND payroll_enabled = TRUE
    AND wallet_balance >= 300000
    AND (
      country_code = _country_code
      OR _country_code = ANY(supported_countries)
    )
  ORDER BY 
    CASE WHEN country_code = _country_code THEN 0 ELSE 1 END, -- Prioritize exact country match
    wallet_balance DESC -- Higher balance = more reliable
  LIMIT 1;
  
  -- Assign the helper if found
  IF _helper_id IS NOT NULL THEN
    NEW.assigned_helper_id := _helper_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-assign helper on withdrawal creation
DROP TRIGGER IF EXISTS trg_auto_assign_withdrawal_helper ON agency_withdrawals;
CREATE TRIGGER trg_auto_assign_withdrawal_helper
  BEFORE INSERT ON agency_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_withdrawal_helper();

-- Add comment for documentation
COMMENT ON FUNCTION public.auto_assign_withdrawal_helper() IS 
'Automatically assigns a withdrawal request to a country-specific payroll helper based on the withdrawal country code';
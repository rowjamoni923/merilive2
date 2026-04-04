-- Add columns to track host earnings crediting status
ALTER TABLE public.private_calls 
ADD COLUMN IF NOT EXISTS host_earnings_credited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS host_earnings_amount INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS host_earnings_credited_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS host_earnings_credited_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Create index for faster queries on uncredited earnings
CREATE INDEX IF NOT EXISTS idx_private_calls_earnings_not_credited 
ON public.private_calls(host_id, host_earnings_credited) 
WHERE host_earnings_credited = FALSE AND status = 'ended';

-- Create a function to manually credit host earnings
CREATE OR REPLACE FUNCTION public.manual_credit_call_earnings(
  _call_id UUID,
  _admin_id UUID,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call RECORD;
  v_host_commission_rate NUMERIC;
  v_host_earnings INTEGER;
BEGIN
  -- Get call details
  SELECT * INTO v_call FROM private_calls WHERE id = _call_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Call not found');
  END IF;
  
  IF v_call.host_earnings_credited THEN
    RETURN jsonb_build_object('success', false, 'error', 'Earnings already credited');
  END IF;
  
  IF v_call.coins_spent IS NULL OR v_call.coins_spent = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No coins spent on this call');
  END IF;
  
  -- Get commission rate from settings
  SELECT COALESCE((setting_value->>'host_commission_percent')::NUMERIC, 50) / 100
  INTO v_host_commission_rate
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  -- Calculate host earnings
  v_host_earnings := FLOOR(v_call.coins_spent * v_host_commission_rate);
  
  -- Credit the host
  UPDATE profiles
  SET pending_earnings = COALESCE(pending_earnings, 0) + v_host_earnings,
      total_earnings = COALESCE(total_earnings, 0) + v_host_earnings
  WHERE id = v_call.host_id;
  
  -- Update call record
  UPDATE private_calls
  SET host_earnings_credited = TRUE,
      host_earnings_amount = v_host_earnings,
      host_earnings_credited_at = NOW(),
      host_earnings_credited_by = _admin_id,
      admin_notes = _notes
  WHERE id = _call_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'host_id', v_call.host_id,
    'earnings_credited', v_host_earnings,
    'call_id', _call_id
  );
END;
$$;

-- Create a function to bulk credit uncredited call earnings
CREATE OR REPLACE FUNCTION public.bulk_credit_call_earnings(
  _admin_id UUID,
  _call_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_id UUID;
  v_result JSONB;
  v_success_count INTEGER := 0;
  v_fail_count INTEGER := 0;
  v_total_credited INTEGER := 0;
BEGIN
  FOREACH v_call_id IN ARRAY _call_ids
  LOOP
    v_result := manual_credit_call_earnings(v_call_id, _admin_id, 'Bulk credit by admin');
    IF (v_result->>'success')::BOOLEAN THEN
      v_success_count := v_success_count + 1;
      v_total_credited := v_total_credited + COALESCE((v_result->>'earnings_credited')::INTEGER, 0);
    ELSE
      v_fail_count := v_fail_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'credited_count', v_success_count,
    'failed_count', v_fail_count,
    'total_beans_credited', v_total_credited
  );
END;
$$;

-- FIX 1: update_host_call_earnings - also add to weekly_earnings so host level increases from call earnings
CREATE OR REPLACE FUNCTION public.update_host_call_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_is_host BOOLEAN;
  _coins_earned NUMERIC;
BEGIN
  -- Only process when call ends (status changed to 'ended')
  IF NEW.status = 'ended' AND OLD.status != 'ended' THEN
    -- Get host status
    SELECT is_host INTO _host_is_host
    FROM public.profiles
    WHERE id = NEW.host_id;
    
    IF _host_is_host = true AND COALESCE(NEW.coins_spent, 0) > 0 THEN
      -- Host gets 40% of call earnings as beans
      _coins_earned := FLOOR(NEW.coins_spent * 0.4);
      
      UPDATE public.profiles
      SET pending_earnings = COALESCE(pending_earnings, 0) + _coins_earned,
          total_earnings = COALESCE(total_earnings, 0) + _coins_earned,
          -- CRITICAL FIX: Also add to weekly_earnings so host level increases
          weekly_earnings = COALESCE(weekly_earnings, 0) + _coins_earned
      WHERE id = NEW.host_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- FIX 2: manual_credit_call_earnings - also add to weekly_earnings
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
  -- Verify admin identity
  IF auth.uid() IS NOT NULL AND (auth.uid() != _admin_id OR NOT public.is_admin(auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

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
  
  SELECT COALESCE((setting_value->>'host_commission_percent')::NUMERIC, 50) / 100
  INTO v_host_commission_rate
  FROM app_settings WHERE setting_key = 'call_rates';
  
  v_host_earnings := FLOOR(v_call.coins_spent * v_host_commission_rate);
  
  UPDATE profiles
  SET pending_earnings = COALESCE(pending_earnings, 0) + v_host_earnings,
      total_earnings = COALESCE(total_earnings, 0) + v_host_earnings,
      -- CRITICAL FIX: Also add to weekly_earnings so host level increases
      weekly_earnings = COALESCE(weekly_earnings, 0) + v_host_earnings
  WHERE id = v_call.host_id;
  
  UPDATE private_calls
  SET host_earnings_credited = TRUE,
      host_earnings_amount = v_host_earnings,
      host_earnings_credited_at = NOW(),
      host_earnings_credited_by = _admin_id,
      admin_notes = _notes
  WHERE id = _call_id;
  
  RETURN jsonb_build_object(
    'success', true, 'host_id', v_call.host_id,
    'earnings_credited', v_host_earnings, 'call_id', _call_id
  );
END;
$$;

-- FIX 3: finalize_first_minute_earnings - also add to weekly_earnings
-- First let's check the current function and update it
CREATE OR REPLACE FUNCTION public.finalize_first_minute_earnings(p_call_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _call_record record;
  _settings jsonb;
  _host_commission_percent integer;
  _grace_period_seconds integer;
  _first_minute_beans integer;
  _actual_duration_seconds integer;
BEGIN
  -- Get call record
  SELECT * INTO _call_record
  FROM private_calls
  WHERE id = p_call_id;
  
  IF _call_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_not_found');
  END IF;
  
  -- Get settings
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  -- Get commission percent
  IF _settings IS NULL OR (_settings->>'host_commission_percent') IS NULL THEN
    _host_commission_percent := 0;
  ELSE
    _host_commission_percent := (_settings->>'host_commission_percent')::integer;
  END IF;
  
  -- Get grace period
  IF _settings IS NULL OR (_settings->>'first_minute_grace_seconds') IS NULL THEN
    _grace_period_seconds := 21;
  ELSE
    _grace_period_seconds := (_settings->>'first_minute_grace_seconds')::integer;
  END IF;
  
  -- Calculate actual duration (from start to end)
  _actual_duration_seconds := GREATEST(
    EXTRACT(EPOCH FROM (COALESCE(_call_record.ended_at, now()) - _call_record.started_at))::integer,
    0
  );
  
  -- If call lasted less than grace period, host gets nothing (already 0)
  IF _actual_duration_seconds < _grace_period_seconds THEN
    RETURN jsonb_build_object(
      'success', true, 'beans_earned', 0,
      'reason', 'call_too_short',
      'duration_seconds', _actual_duration_seconds,
      'grace_period', _grace_period_seconds
    );
  END IF;
  
  -- Calculate first minute beans (commission % of coins_per_minute)
  _first_minute_beans := FLOOR(COALESCE(_call_record.coins_per_minute, 0) * _host_commission_percent / 100);
  
  IF _first_minute_beans > 0 THEN
    -- Credit beans to host
    UPDATE profiles
    SET pending_earnings = COALESCE(pending_earnings, 0) + _first_minute_beans,
        total_earnings = COALESCE(total_earnings, 0) + _first_minute_beans,
        -- CRITICAL FIX: Also add to weekly_earnings so host level increases
        weekly_earnings = COALESCE(weekly_earnings, 0) + _first_minute_beans
    WHERE id = _call_record.host_id;
    
    -- Update call record
    UPDATE private_calls
    SET host_earnings_amount = COALESCE(host_earnings_amount, 0) + _first_minute_beans
    WHERE id = p_call_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 'beans_earned', _first_minute_beans,
    'duration_seconds', _actual_duration_seconds,
    'commission_percent', _host_commission_percent
  );
END;
$$;

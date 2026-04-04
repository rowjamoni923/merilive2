-- Update the gift transaction trigger to also update pending_earnings (beans)
CREATE OR REPLACE FUNCTION public.update_host_earnings_on_gift()
RETURNS TRIGGER AS $$
DECLARE
  _host_is_host BOOLEAN;
  _host_agency_id UUID;
  _period_start DATE;
  _commission_percent NUMERIC;
  _host_earnings NUMERIC;
BEGIN
  -- Check if receiver is a host
  SELECT is_host, agency_id INTO _host_is_host, _host_agency_id
  FROM public.profiles
  WHERE id = NEW.receiver_id;
  
  -- If receiver is a host, calculate their share (default 40%)
  IF _host_is_host = true THEN
    -- Get commission settings
    SELECT COALESCE((setting_value->>'host_gift_percent')::numeric, 40)
    INTO _commission_percent
    FROM app_settings
    WHERE setting_key = 'commission_settings';
    
    IF _commission_percent IS NULL THEN
      _commission_percent := 40;
    END IF;
    
    -- Calculate host earnings (beans)
    _host_earnings := FLOOR(NEW.coin_amount * _commission_percent / 100);
    
    -- Update host's pending_earnings (beans shown in UI) directly
    UPDATE public.profiles
    SET pending_earnings = COALESCE(pending_earnings, 0) + _host_earnings,
        total_earnings = COALESCE(total_earnings, 0) + _host_earnings
    WHERE id = NEW.receiver_id;
    
    -- If host belongs to an agency, update agency performance
    IF _host_agency_id IS NOT NULL THEN
      _period_start := date_trunc('week', CURRENT_DATE)::date;
      
      INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
      VALUES (_host_agency_id, 'weekly', _period_start, _host_earnings, _host_earnings)
      ON CONFLICT (agency_id, period_type, period_start)
      DO UPDATE SET 
        total_income = agency_performance.total_income + _host_earnings,
        golden_host_income = agency_performance.golden_host_income + _host_earnings,
        updated_at = now();
    END IF;
  ELSE
    -- Non-host receivers get full gift value as coins
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + NEW.coin_amount
    WHERE id = NEW.receiver_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS on_gift_transaction ON public.gift_transactions;
DROP TRIGGER IF EXISTS on_gift_transaction_earnings ON public.gift_transactions;

CREATE TRIGGER on_gift_transaction_earnings
  AFTER INSERT ON public.gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_host_earnings_on_gift();

-- Also create a function to update pending_earnings from call earnings
CREATE OR REPLACE FUNCTION public.update_host_call_earnings()
RETURNS TRIGGER AS $$
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
          total_earnings = COALESCE(total_earnings, 0) + _coins_earned
      WHERE id = NEW.host_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for private calls
DROP TRIGGER IF EXISTS on_call_ended_earnings ON public.private_calls;

CREATE TRIGGER on_call_ended_earnings
  AFTER UPDATE ON public.private_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.update_host_call_earnings();

-- FIX: Remove duplicate total_earnings updates from triggers
-- The process_gift_transaction RPC already handles total_earnings correctly
-- These triggers are DOUBLE-COUNTING earnings!

-- 1. Fix update_host_earnings_on_gift - remove total_earnings/pending_earnings update
-- since process_gift_transaction already handles it
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
  
  -- If receiver is a host and belongs to an agency, update agency performance ONLY
  -- DO NOT update total_earnings here - process_gift_transaction already does it
  IF _host_is_host = true AND _host_agency_id IS NOT NULL THEN
    _commission_percent := 40;
    _host_earnings := FLOOR(NEW.coin_amount * _commission_percent / 100);
    
    _period_start := date_trunc('week', CURRENT_DATE)::date;
    
    INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
    VALUES (_host_agency_id, 'weekly', _period_start, _host_earnings, _host_earnings)
    ON CONFLICT (agency_id, period_type, period_start)
    DO UPDATE SET 
      total_income = agency_performance.total_income + _host_earnings,
      golden_host_income = agency_performance.golden_host_income + _host_earnings,
      updated_at = now();
  END IF;
  
  -- For NON-hosts, still credit coins (process_gift_transaction only handles hosts)
  IF _host_is_host IS NOT TRUE THEN
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + NEW.coin_amount
    WHERE id = NEW.receiver_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Fix update_agency_performance_on_gift - remove total_earnings update completely
-- This was adding 100% of coin_amount to total_earnings which is WRONG
CREATE OR REPLACE FUNCTION public.update_agency_performance_on_gift()
RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _period_start DATE;
BEGIN
  -- Get the host's agency
  SELECT agency_id INTO _host_agency_id
  FROM public.profiles
  WHERE id = NEW.receiver_id;
  
  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get current week start
  _period_start := date_trunc('week', CURRENT_DATE)::date;
  
  -- Update or insert weekly performance (agency tracking only)
  INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
  VALUES (_host_agency_id, 'weekly', _period_start, NEW.coin_amount, NEW.coin_amount)
  ON CONFLICT (agency_id, period_type, period_start)
  DO UPDATE SET 
    total_income = agency_performance.total_income + NEW.coin_amount,
    golden_host_income = agency_performance.golden_host_income + NEW.coin_amount,
    updated_at = now();
  
  -- DO NOT update total_earnings here! process_gift_transaction handles it.
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

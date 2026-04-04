
-- Fix: Convert coin_amount to USD before storing in agency_performance
-- Formula: USD = (coin_amount × host_share%) / beans_per_dollar
-- host_share = 60% (0.6), beans_per_dollar = 9000

CREATE OR REPLACE FUNCTION public.update_agency_performance_on_gift()
RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _period_start DATE;
  _beans_per_dollar NUMERIC;
  _host_share NUMERIC;
  _usd_amount NUMERIC;
BEGIN
  -- Get the host's agency
  SELECT agency_id INTO _host_agency_id
  FROM public.profiles
  WHERE id = NEW.receiver_id;
  
  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch dynamic rates from app_settings (with safe defaults)
  SELECT COALESCE((setting_value)::numeric, 9000) INTO _beans_per_dollar
  FROM public.app_settings WHERE setting_key = 'beans_per_dollar';
  IF _beans_per_dollar IS NULL OR _beans_per_dollar <= 0 THEN
    _beans_per_dollar := 9000;
  END IF;

  SELECT COALESCE((setting_value)::numeric, 55) INTO _host_share
  FROM public.app_settings WHERE setting_key = 'host_percent';
  IF _host_share IS NULL OR _host_share <= 0 THEN
    _host_share := 55;
  END IF;

  -- Convert coins to USD: (coins × host_share%) / beans_per_dollar
  _usd_amount := ROUND((NEW.coin_amount * (_host_share / 100.0)) / _beans_per_dollar, 2);
  
  -- Get current week start
  _period_start := date_trunc('week', CURRENT_DATE)::date;
  
  -- Update or insert weekly performance with USD amount
  INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, golden_host_income)
  VALUES (_host_agency_id, 'weekly', _period_start, _usd_amount, _usd_amount)
  ON CONFLICT (agency_id, period_type, period_start)
  DO UPDATE SET 
    total_income = agency_performance.total_income + _usd_amount,
    golden_host_income = agency_performance.golden_host_income + _usd_amount,
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Now fix ALL existing corrupted data in agency_performance
-- Recalculate total_income from actual gift_transactions
-- For each agency's weekly period, sum the USD value of gifts received by their hosts

-- First, reset all current week performance data
UPDATE public.agency_performance
SET total_income = 0, golden_host_income = 0, updated_at = now()
WHERE period_type = 'weekly'
  AND period_start >= date_trunc('week', CURRENT_DATE)::date;

-- Recalculate from gift_transactions with proper USD conversion
WITH correct_income AS (
  SELECT 
    p.agency_id,
    date_trunc('week', gt.created_at)::date AS period_start,
    ROUND(SUM(gt.coin_amount * 0.55 / 9000.0), 2) AS correct_usd
  FROM gift_transactions gt
  JOIN profiles p ON p.id = gt.receiver_id
  JOIN agency_hosts ah ON ah.host_id = gt.receiver_id AND ah.status = 'active'
  WHERE p.agency_id IS NOT NULL
    AND gt.created_at >= date_trunc('week', CURRENT_DATE)
  GROUP BY p.agency_id, date_trunc('week', gt.created_at)::date
)
UPDATE agency_performance ap
SET 
  total_income = ci.correct_usd,
  golden_host_income = ci.correct_usd,
  updated_at = now()
FROM correct_income ci
WHERE ap.agency_id = ci.agency_id
  AND ap.period_start = ci.period_start
  AND ap.period_type = 'weekly';

-- Recalculate all agency levels based on corrected data
SELECT recalculate_all_agency_levels();

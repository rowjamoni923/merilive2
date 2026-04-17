
-- Fix broken currency rates: convert negative to positive (absolute value) and add country names
UPDATE public.currency_rates SET rate_to_usd = 3.67, country_name = 'United Arab Emirates' WHERE currency_code = 'AED' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 3.75, country_name = 'Saudi Arabia' WHERE currency_code = 'SAR' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 0.31, country_name = 'Kuwait' WHERE currency_code = 'KWD' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 3.64, country_name = 'Qatar' WHERE currency_code = 'QAR' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 0.38, country_name = 'Oman' WHERE currency_code = 'OMR' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 4.45, country_name = 'Malaysia' WHERE currency_code = 'MYR' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 1.34, country_name = 'Singapore' WHERE currency_code = 'SGD' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 0.79, country_name = 'United Kingdom' WHERE currency_code = 'GBP' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 1.52, country_name = 'Australia' WHERE currency_code = 'AUD' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 1.38, country_name = 'Canada' WHERE currency_code = 'CAD' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 0.92, country_name = 'European Union' WHERE currency_code = 'EUR' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 0.38, country_name = 'Bahrain' WHERE currency_code = 'BHD' AND rate_to_usd <= 0;
UPDATE public.currency_rates SET rate_to_usd = 0.71, country_name = 'Jordan' WHERE currency_code = 'JOD' AND rate_to_usd <= 0;

-- Backfill country_name for any other rates that might have NULL country_name
UPDATE public.currency_rates SET country_name = currency_code WHERE country_name IS NULL OR country_name = '';

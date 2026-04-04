-- Update Bangladesh rate to 116 BDT per USD (as requested by admin)
UPDATE public.currency_rates 
SET rate_to_usd = 116.00, updated_at = now() 
WHERE country_code = 'BD';

-- Update US to proper 1:1 rate
UPDATE public.currency_rates 
SET rate_to_usd = 1.00, updated_at = now() 
WHERE country_code = 'US';

-- Update India to current market rate (~83 INR)
UPDATE public.currency_rates 
SET rate_to_usd = 83.50, updated_at = now() 
WHERE country_code = 'IN';

-- Update Pakistan to current market rate (~278 PKR)
UPDATE public.currency_rates 
SET rate_to_usd = 278.00, updated_at = now() 
WHERE country_code = 'PK';

-- Update Nepal to current market rate (~133 NPR)
UPDATE public.currency_rates 
SET rate_to_usd = 133.50, updated_at = now() 
WHERE country_code = 'NP';

-- Update Euro to current market rate (~0.92 EUR)
UPDATE public.currency_rates 
SET rate_to_usd = 0.92, updated_at = now() 
WHERE country_code = 'EU';

-- Update UK to current market rate (~0.79 GBP)
UPDATE public.currency_rates 
SET rate_to_usd = 0.79, updated_at = now() 
WHERE country_code = 'GB';

-- Update Saudi Arabia to current market rate (~3.75 SAR)
UPDATE public.currency_rates 
SET rate_to_usd = 3.75, updated_at = now() 
WHERE country_code = 'SA';

-- Update UAE to current market rate (~3.67 AED)
UPDATE public.currency_rates 
SET rate_to_usd = 3.67, updated_at = now() 
WHERE country_code = 'AE';

-- Update Kuwait to current market rate (~0.31 KWD)
UPDATE public.currency_rates 
SET rate_to_usd = 0.31, updated_at = now() 
WHERE country_code = 'KW';

-- Update Qatar to current market rate (~3.64 QAR)
UPDATE public.currency_rates 
SET rate_to_usd = 3.64, updated_at = now() 
WHERE country_code = 'QA';

-- Update Oman to current market rate (~0.385 OMR)
UPDATE public.currency_rates 
SET rate_to_usd = 0.385, updated_at = now() 
WHERE country_code = 'OM';

-- Update Malaysia to current market rate (~4.47 MYR)
UPDATE public.currency_rates 
SET rate_to_usd = 4.47, updated_at = now() 
WHERE country_code = 'MY';

-- Update Singapore to current market rate (~1.34 SGD)
UPDATE public.currency_rates 
SET rate_to_usd = 1.34, updated_at = now() 
WHERE country_code = 'SG';

-- Update Australia to current market rate (~1.54 AUD)
UPDATE public.currency_rates 
SET rate_to_usd = 1.54, updated_at = now() 
WHERE country_code = 'AU';

-- Update Canada to current market rate (~1.36 CAD)
UPDATE public.currency_rates 
SET rate_to_usd = 1.36, updated_at = now() 
WHERE country_code = 'CA';

-- Update Japan to current market rate (~150 JPY)
UPDATE public.currency_rates 
SET rate_to_usd = 150.00, updated_at = now() 
WHERE country_code = 'JP';

-- Update South Korea to current market rate (~1320 KRW)
UPDATE public.currency_rates 
SET rate_to_usd = 1320.00, updated_at = now() 
WHERE country_code = 'KR';

-- Update Indonesia to current market rate (~15800 IDR)
UPDATE public.currency_rates 
SET rate_to_usd = 15800.00, updated_at = now() 
WHERE country_code = 'ID';

-- Update Thailand to current market rate (~35 THB)
UPDATE public.currency_rates 
SET rate_to_usd = 35.00, updated_at = now() 
WHERE country_code = 'TH';

-- Update Philippines to current market rate (~56 PHP)
UPDATE public.currency_rates 
SET rate_to_usd = 56.00, updated_at = now() 
WHERE country_code = 'PH';

-- Update Vietnam to current market rate (~24500 VND)
UPDATE public.currency_rates 
SET rate_to_usd = 24500.00, updated_at = now() 
WHERE country_code = 'VN';

-- Update Egypt to current market rate (~50 EGP)
UPDATE public.currency_rates 
SET rate_to_usd = 50.00, updated_at = now() 
WHERE country_code = 'EG';

-- Update Nigeria to current market rate (~1550 NGN)
UPDATE public.currency_rates 
SET rate_to_usd = 1550.00, updated_at = now() 
WHERE country_code = 'NG';

-- Update Kenya to current market rate (~153 KES)
UPDATE public.currency_rates 
SET rate_to_usd = 153.00, updated_at = now() 
WHERE country_code = 'KE';

-- Update Ghana to current market rate (~12.50 GHS)
UPDATE public.currency_rates 
SET rate_to_usd = 12.50, updated_at = now() 
WHERE country_code = 'GH';

-- Update South Africa to current market rate (~18.50 ZAR)
UPDATE public.currency_rates 
SET rate_to_usd = 18.50, updated_at = now() 
WHERE country_code = 'ZA';

-- Update Turkey to current market rate (~32 TRY)
UPDATE public.currency_rates 
SET rate_to_usd = 32.00, updated_at = now() 
WHERE country_code = 'TR';
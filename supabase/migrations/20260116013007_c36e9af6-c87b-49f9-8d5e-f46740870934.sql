-- Disable ePay and Binance Pay gateways (keeping only country-specific wallets)
UPDATE public.payment_gateways 
SET is_active = false 
WHERE gateway_code IN ('epay', 'binance');
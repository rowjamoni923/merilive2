-- Deactivate bKash, Nagad, Rocket, Bank Transfer - keep only Binance Pay and ePay active
UPDATE public.topup_payment_methods 
SET is_active = false 
WHERE method_name IN ('bKash', 'Nagad', 'Rocket', 'Bank Transfer');

-- Update display order for Binance Pay and ePay
UPDATE public.topup_payment_methods 
SET display_order = 1 
WHERE method_name = 'Binance Pay';

UPDATE public.topup_payment_methods 
SET display_order = 2 
WHERE method_name = 'ePay';
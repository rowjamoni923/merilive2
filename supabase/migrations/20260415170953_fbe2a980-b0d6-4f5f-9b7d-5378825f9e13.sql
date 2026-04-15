-- Add currency_symbol column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'currency_rates' AND column_name = 'currency_symbol'
  ) THEN
    ALTER TABLE public.currency_rates ADD COLUMN currency_symbol text DEFAULT '$';
  END IF;
END $$;

-- Update common currency symbols for existing rows
UPDATE public.currency_rates SET currency_symbol = '৳' WHERE currency_code = 'BDT' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '₹' WHERE currency_code = 'INR' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '₨' WHERE currency_code = 'PKR' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '€' WHERE currency_code = 'EUR' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '£' WHERE currency_code = 'GBP' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '$' WHERE currency_code = 'USD' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'RM' WHERE currency_code = 'MYR' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '₺' WHERE currency_code = 'TRY' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'ر.س' WHERE currency_code = 'SAR' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'د.إ' WHERE currency_code = 'AED' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '¥' WHERE currency_code = 'JPY' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '₩' WHERE currency_code = 'KRW' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '฿' WHERE currency_code = 'THB' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '₫' WHERE currency_code = 'VND' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'Rp' WHERE currency_code = 'IDR' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '₱' WHERE currency_code = 'PHP' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'R$' WHERE currency_code = 'BRL' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'E£' WHERE currency_code = 'EGP' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'C$' WHERE currency_code = 'CAD' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'A$' WHERE currency_code = 'AUD' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '₦' WHERE currency_code = 'NGN' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'KSh' WHERE currency_code = 'KES' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'R' WHERE currency_code = 'ZAR' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '₸' WHERE currency_code = 'KZT' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'лв' WHERE currency_code = 'BGN' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'Kč' WHERE currency_code = 'CZK' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'kr' WHERE currency_code IN ('SEK', 'NOK', 'DKK') AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'zł' WHERE currency_code = 'PLN' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'Ft' WHERE currency_code = 'HUF' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'lei' WHERE currency_code = 'RON' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'CHF' WHERE currency_code = 'CHF' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = '¥' WHERE currency_code = 'CNY' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'NZ$' WHERE currency_code = 'NZD' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'S$' WHERE currency_code = 'SGD' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'HK$' WHERE currency_code = 'HKD' AND (currency_symbol IS NULL OR currency_symbol = '$');
UPDATE public.currency_rates SET currency_symbol = 'NT$' WHERE currency_code = 'TWD' AND (currency_symbol IS NULL OR currency_symbol = '$');
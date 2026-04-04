-- Create coin packages table for admin management
CREATE TABLE public.coin_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coins INTEGER NOT NULL,
  base_coins INTEGER NOT NULL DEFAULT 0,
  price_usd DECIMAL(10,2) NOT NULL,
  bonus_percentage INTEGER DEFAULT 0,
  is_popular BOOLEAN DEFAULT false,
  is_best_value BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create currency rates table for auto-conversion
CREATE TABLE public.currency_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code VARCHAR(2) NOT NULL UNIQUE,
  currency_code VARCHAR(3) NOT NULL,
  currency_symbol VARCHAR(10) NOT NULL,
  rate_to_usd DECIMAL(12,4) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coin_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

-- Anyone can view active packages
CREATE POLICY "Anyone can view active packages" ON public.coin_packages
FOR SELECT USING (is_active = true);

-- Admins can manage packages
CREATE POLICY "Admins can manage packages" ON public.coin_packages
FOR ALL USING (public.is_admin(auth.uid()));

-- Anyone can view currency rates
CREATE POLICY "Anyone can view currency rates" ON public.currency_rates
FOR SELECT USING (is_active = true);

-- Admins can manage currency rates
CREATE POLICY "Admins can manage currency rates" ON public.currency_rates
FOR ALL USING (public.is_admin(auth.uid()));

-- Insert default coin packages
INSERT INTO public.coin_packages (coins, base_coins, price_usd, bonus_percentage, is_popular, is_best_value, display_order) VALUES
(4000, 4000, 0.99, 0, false, false, 1),
(13200, 12000, 2.99, 10, false, false, 2),
(48000, 40000, 9.99, 20, true, false, 3),
(150000, 120000, 30.99, 25, false, false, 4),
(520000, 400000, 104.99, 30, false, false, 5),
(57000, 40000, 9.99, 42, false, true, 6);

-- Insert common currency rates
INSERT INTO public.currency_rates (country_code, currency_code, currency_symbol, rate_to_usd) VALUES
('BD', 'BDT', '৳', 110.50),
('IN', 'INR', '₹', 83.50),
('PK', 'PKR', 'Rs', 278.50),
('US', 'USD', '$', 1.00),
('GB', 'GBP', '£', 0.79),
('AE', 'AED', 'د.إ', 3.67),
('SA', 'SAR', 'ر.س', 3.75),
('MY', 'MYR', 'RM', 4.47),
('SG', 'SGD', 'S$', 1.34),
('CA', 'CAD', 'C$', 1.36),
('AU', 'AUD', 'A$', 1.53),
('EU', 'EUR', '€', 0.92),
('JP', 'JPY', '¥', 149.50),
('KR', 'KRW', '₩', 1325.00),
('NP', 'NPR', 'रू', 133.50),
('QA', 'QAR', 'ر.ق', 3.64),
('KW', 'KWD', 'د.ك', 0.31),
('OM', 'OMR', 'ر.ع.', 0.38);

-- Create function to update timestamps
CREATE TRIGGER update_coin_packages_timestamp
BEFORE UPDATE ON public.coin_packages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_currency_rates_timestamp
BEFORE UPDATE ON public.currency_rates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
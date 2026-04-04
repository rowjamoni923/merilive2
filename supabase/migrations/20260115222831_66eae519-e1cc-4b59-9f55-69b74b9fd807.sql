-- Add helper_diamond_packages table for level-based diamond pricing
CREATE TABLE IF NOT EXISTS public.helper_diamond_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_number integer NOT NULL CHECK (level_number >= 1 AND level_number <= 5),
  diamond_amount numeric NOT NULL DEFAULT 80000,
  price_usd numeric NOT NULL DEFAULT 17,
  price_local numeric DEFAULT NULL,
  currency_code text DEFAULT 'USD',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(level_number)
);

-- Enable RLS
ALTER TABLE public.helper_diamond_packages ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read (helpers need to see their pricing)
CREATE POLICY "Anyone can view helper diamond packages"
  ON public.helper_diamond_packages
  FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage helper diamond packages"
  ON public.helper_diamond_packages
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- Insert default pricing per level (level = more diamonds for same price)
INSERT INTO public.helper_diamond_packages (level_number, diamond_amount, price_usd) VALUES
  (1, 80000, 17),
  (2, 90000, 17),
  (3, 95000, 17),
  (4, 100000, 17),
  (5, 105000, 17)
ON CONFLICT (level_number) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX idx_helper_diamond_packages_level ON public.helper_diamond_packages(level_number);
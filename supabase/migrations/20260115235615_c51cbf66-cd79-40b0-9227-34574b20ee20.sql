-- Add columns to agency_withdrawals for Level 5 helper processing
ALTER TABLE public.agency_withdrawals 
ADD COLUMN IF NOT EXISTS assigned_helper_id uuid REFERENCES public.topup_helpers(id),
ADD COLUMN IF NOT EXISTS helper_payment_screenshot text,
ADD COLUMN IF NOT EXISTS helper_transaction_id text,
ADD COLUMN IF NOT EXISTS helper_processed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS helper_notes text,
ADD COLUMN IF NOT EXISTS country_code text,
ADD COLUMN IF NOT EXISTS local_currency_amount numeric,
ADD COLUMN IF NOT EXISTS currency_code text,
ADD COLUMN IF NOT EXISTS diamond_reward numeric DEFAULT 0;

-- Create index for faster queries by country and helper
CREATE INDEX IF NOT EXISTS idx_agency_withdrawals_country ON public.agency_withdrawals(country_code);
CREATE INDEX IF NOT EXISTS idx_agency_withdrawals_helper ON public.agency_withdrawals(assigned_helper_id);

-- Create helper country payment methods table for Level 5 helpers to manage country-specific payment methods
CREATE TABLE IF NOT EXISTS public.helper_country_payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id uuid NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  method_name text NOT NULL,
  method_type text NOT NULL DEFAULT 'bank',
  account_name text NOT NULL,
  account_number text NOT NULL,
  bank_name text,
  additional_info jsonb,
  qr_code_url text,
  instructions text,
  min_amount numeric DEFAULT 10,
  max_amount numeric DEFAULT 10000,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.helper_country_payment_methods ENABLE ROW LEVEL SECURITY;

-- Policies for helper country payment methods
CREATE POLICY "Helpers can view their own payment methods"
ON public.helper_country_payment_methods
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.topup_helpers 
    WHERE id = helper_country_payment_methods.helper_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Helpers can insert their own payment methods"
ON public.helper_country_payment_methods
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.topup_helpers 
    WHERE id = helper_country_payment_methods.helper_id 
    AND user_id = auth.uid()
    AND trader_level = 5 
    AND payroll_enabled = true
  )
);

CREATE POLICY "Helpers can update their own payment methods"
ON public.helper_country_payment_methods
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.topup_helpers 
    WHERE id = helper_country_payment_methods.helper_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Helpers can delete their own payment methods"
ON public.helper_country_payment_methods
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.topup_helpers 
    WHERE id = helper_country_payment_methods.helper_id 
    AND user_id = auth.uid()
  )
);

-- Admin policy using user_roles table
CREATE POLICY "Admins can manage all helper payment methods"
ON public.helper_country_payment_methods
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create helper assigned countries table
CREATE TABLE IF NOT EXISTS public.helper_assigned_countries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id uuid NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  is_active boolean DEFAULT true,
  assigned_at timestamp with time zone DEFAULT now(),
  assigned_by uuid,
  UNIQUE(helper_id, country_code)
);

-- Enable RLS
ALTER TABLE public.helper_assigned_countries ENABLE ROW LEVEL SECURITY;

-- Policies for helper assigned countries
CREATE POLICY "Helpers can view their assigned countries"
ON public.helper_assigned_countries
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.topup_helpers 
    WHERE id = helper_assigned_countries.helper_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage helper country assignments"
ON public.helper_assigned_countries
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create trigger to update timestamps
CREATE TRIGGER update_helper_country_payment_methods_updated_at
BEFORE UPDATE ON public.helper_country_payment_methods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
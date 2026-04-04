-- Add payroll application tracking columns to topup_helpers
ALTER TABLE public.topup_helpers 
ADD COLUMN IF NOT EXISTS payroll_applied_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payroll_status TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS payroll_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS payroll_approved_by UUID REFERENCES auth.users(id);

-- Add comment
COMMENT ON COLUMN public.topup_helpers.payroll_status IS 'pending, approved, rejected';
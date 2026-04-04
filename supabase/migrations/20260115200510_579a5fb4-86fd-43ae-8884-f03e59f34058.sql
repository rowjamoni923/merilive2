
-- Create helper_applications table for tracking applications with level selection
CREATE TABLE IF NOT EXISTS public.helper_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id),
  requested_level INTEGER NOT NULL DEFAULT 1,
  payroll_requested BOOLEAN DEFAULT false,
  contact_phone TEXT,
  contact_whatsapp TEXT,
  contact_telegram TEXT,
  payment_method TEXT,
  payment_details JSONB DEFAULT '{}',
  reason TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.helper_applications ENABLE ROW LEVEL SECURITY;

-- RLS policies for helper_applications - open policies for simplicity
CREATE POLICY "Allow all for helper_applications"
ON public.helper_applications FOR ALL
USING (true)
WITH CHECK (true);

-- Create payroll_requests table if not exists
CREATE TABLE IF NOT EXISTS public.payroll_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.agencies(id),
  trader_id UUID REFERENCES public.topup_helpers(id),
  beans_amount INTEGER NOT NULL,
  usd_amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT,
  payment_proof_url TEXT,
  bank_details JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'processing', 'completed', 'rejected')),
  notes TEXT,
  admin_notes TEXT,
  processed_by UUID,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payroll_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for payroll_requests - open policies for simplicity
CREATE POLICY "Allow all for payroll_requests"
ON public.payroll_requests FOR ALL
USING (true)
WITH CHECK (true);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_helper_applications_status ON public.helper_applications(status);
CREATE INDEX IF NOT EXISTS idx_helper_applications_user_id ON public.helper_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_requests_status ON public.payroll_requests(status);
CREATE INDEX IF NOT EXISTS idx_payroll_requests_agency_id ON public.payroll_requests(agency_id);

-- Create helper_upgrade_requests table for level upgrade applications
CREATE TABLE public.helper_upgrade_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id UUID NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_level INTEGER NOT NULL,
  amount_usd DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  payment_proof_url TEXT,
  transaction_id TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create helper_topup_requests table for manual top-up requests
CREATE TABLE public.helper_topup_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id UUID NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_usd DECIMAL(10,2) NOT NULL,
  coin_amount INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  payment_proof_url TEXT,
  transaction_id TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.helper_upgrade_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_topup_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for helper_upgrade_requests
CREATE POLICY "Helpers can view their own upgrade requests"
  ON public.helper_upgrade_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Helpers can create upgrade requests"
  ON public.helper_upgrade_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS policies for helper_topup_requests
CREATE POLICY "Helpers can view their own topup requests"
  ON public.helper_topup_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Helpers can create topup requests"
  ON public.helper_topup_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for payment proofs
CREATE POLICY "Users can upload payment proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-proofs' AND auth.role() = 'authenticated');

CREATE POLICY "Payment proofs are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs');

-- Add indexes
CREATE INDEX idx_helper_upgrade_requests_helper ON public.helper_upgrade_requests(helper_id);
CREATE INDEX idx_helper_upgrade_requests_status ON public.helper_upgrade_requests(status);
CREATE INDEX idx_helper_topup_requests_helper ON public.helper_topup_requests(helper_id);
CREATE INDEX idx_helper_topup_requests_status ON public.helper_topup_requests(status);

-- Triggers for updated_at
CREATE TRIGGER update_helper_upgrade_requests_updated_at
  BEFORE UPDATE ON public.helper_upgrade_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_helper_topup_requests_updated_at
  BEFORE UPDATE ON public.helper_topup_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
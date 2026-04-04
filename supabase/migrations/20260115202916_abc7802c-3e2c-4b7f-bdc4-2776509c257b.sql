-- Helper Payment Methods (country-based)
CREATE TABLE IF NOT EXISTS public.helper_payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id UUID NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  payment_type TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT,
  additional_info JSONB,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Helper Withdrawal Processing (for Level 5 helpers)
CREATE TABLE IF NOT EXISTS public.helper_withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id UUID NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  host_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  withdrawal_id UUID REFERENCES public.agency_withdrawals(id) ON DELETE SET NULL,
  beans_amount INTEGER NOT NULL DEFAULT 0,
  usd_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  local_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency_code TEXT DEFAULT 'BDT',
  exchange_rate DECIMAL(10,4) DEFAULT 1,
  payment_method TEXT,
  payment_screenshot_url TEXT,
  diamond_reward INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  helper_notes TEXT,
  admin_notes TEXT,
  paid_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Helper Level Configuration (admin controlled)
CREATE TABLE IF NOT EXISTS public.helper_level_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level_number INTEGER NOT NULL UNIQUE,
  level_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  has_payroll_access BOOLEAN DEFAULT false,
  has_withdrawal_processing BOOLEAN DEFAULT false,
  commission_rate DECIMAL(5,2) DEFAULT 0,
  min_withdrawal DECIMAL(10,2) DEFAULT 0,
  max_withdrawal DECIMAL(10,2) DEFAULT 0,
  features JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default level configs
INSERT INTO public.helper_level_config (level_number, level_name, is_enabled, has_payroll_access, has_withdrawal_processing, commission_rate)
VALUES 
  (1, 'Bronze', true, false, false, 2),
  (2, 'Silver', true, false, false, 3),
  (3, 'Gold', true, false, false, 4),
  (4, 'Platinum', true, false, false, 5),
  (5, 'Diamond', true, true, true, 7)
ON CONFLICT (level_number) DO NOTHING;

-- Helper Notifications
CREATE TABLE IF NOT EXISTS public.helper_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id UUID NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add country_code to topup_helpers if not exists
ALTER TABLE public.topup_helpers ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'BD';
ALTER TABLE public.topup_helpers ADD COLUMN IF NOT EXISTS payroll_enabled BOOLEAN DEFAULT false;

-- Enable RLS
ALTER TABLE public.helper_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_level_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for helper_payment_methods
CREATE POLICY "Helpers can view own payment methods" ON public.helper_payment_methods
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.topup_helpers WHERE id = helper_id AND user_id = auth.uid())
  );

CREATE POLICY "Helpers can manage own payment methods" ON public.helper_payment_methods
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.topup_helpers WHERE id = helper_id AND user_id = auth.uid())
  );

-- RLS Policies for helper_withdrawal_requests
CREATE POLICY "Helpers can view assigned withdrawals" ON public.helper_withdrawal_requests
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.topup_helpers WHERE id = helper_id AND user_id = auth.uid())
  );

CREATE POLICY "Helpers can update own assigned withdrawals" ON public.helper_withdrawal_requests
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.topup_helpers WHERE id = helper_id AND user_id = auth.uid())
  );

CREATE POLICY "Service role manages all withdrawals" ON public.helper_withdrawal_requests
  FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for helper_level_config (public read, authenticated write)
CREATE POLICY "Anyone can view level config" ON public.helper_level_config
  FOR SELECT USING (true);

CREATE POLICY "Service role manages level config" ON public.helper_level_config
  FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies for helper_notifications
CREATE POLICY "Helpers can view own notifications" ON public.helper_notifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.topup_helpers WHERE id = helper_id AND user_id = auth.uid())
  );

CREATE POLICY "Helpers can update own notifications" ON public.helper_notifications
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.topup_helpers WHERE id = helper_id AND user_id = auth.uid())
  );

CREATE POLICY "Service role manages notifications" ON public.helper_notifications
  FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_helper_payment_methods_helper ON public.helper_payment_methods(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_payment_methods_country ON public.helper_payment_methods(country_code);
CREATE INDEX IF NOT EXISTS idx_helper_withdrawal_requests_helper ON public.helper_withdrawal_requests(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_withdrawal_requests_status ON public.helper_withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_helper_notifications_helper ON public.helper_notifications(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_notifications_unread ON public.helper_notifications(helper_id, is_read);
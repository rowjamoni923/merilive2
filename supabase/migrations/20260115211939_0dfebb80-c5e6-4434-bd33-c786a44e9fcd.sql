-- Create table for admin-managed payment methods for manual top-up
CREATE TABLE public.topup_payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  method_name TEXT NOT NULL,
  method_type TEXT NOT NULL DEFAULT 'bank', -- bank, mobile_wallet, crypto, ewallet
  account_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_name TEXT,
  additional_info JSONB DEFAULT '{}',
  icon_url TEXT,
  qr_code_url TEXT,
  instructions TEXT,
  country_codes TEXT[] DEFAULT ARRAY['BD'],
  min_amount NUMERIC(10,2) DEFAULT 10,
  max_amount NUMERIC(10,2) DEFAULT 10000,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.topup_payment_methods ENABLE ROW LEVEL SECURITY;

-- Everyone can view active payment methods
CREATE POLICY "Anyone can view active payment methods"
  ON public.topup_payment_methods FOR SELECT
  USING (is_active = true);

-- Only admins can manage payment methods (via service role)

-- Add trigger for updated_at
CREATE TRIGGER update_topup_payment_methods_updated_at
  BEFORE UPDATE ON public.topup_payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default payment methods
INSERT INTO public.topup_payment_methods (method_name, method_type, account_name, account_number, bank_name, instructions, display_order) VALUES
('bKash', 'mobile_wallet', 'MeriLive Official', '01XXXXXXXXX', NULL, 'Send money to this bKash number and submit the transaction ID', 1),
('Nagad', 'mobile_wallet', 'MeriLive Official', '01XXXXXXXXX', NULL, 'Send money to this Nagad number and submit the transaction ID', 2),
('Rocket', 'mobile_wallet', 'MeriLive Official', '01XXXXXXXXX', NULL, 'Send money to this Rocket number and submit the transaction ID', 3),
('Bank Transfer', 'bank', 'MeriLive Entertainment Ltd', 'XXXXXXXXXX', 'Dutch Bangla Bank', 'Transfer to this bank account and submit the transaction reference', 4),
('Binance Pay', 'crypto', 'MeriLive', 'binance_pay_id_here', NULL, 'Pay via Binance Pay using Pay ID', 5),
('ePay', 'ewallet', 'MeriLive', 'epay_id_here', NULL, 'Pay via ePay wallet', 6);

-- Create index
CREATE INDEX idx_topup_payment_methods_active ON public.topup_payment_methods(is_active, display_order);
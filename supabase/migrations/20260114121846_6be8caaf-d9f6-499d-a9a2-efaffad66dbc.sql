-- Create payment_gateways table for managing third-party payment methods
CREATE TABLE public.payment_gateways (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  gateway_code TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  api_endpoint TEXT,
  api_key_encrypted TEXT,
  secret_key_encrypted TEXT,
  webhook_url TEXT,
  supported_currencies TEXT[] DEFAULT ARRAY['USD'],
  min_amount NUMERIC DEFAULT 1,
  max_amount NUMERIC DEFAULT 10000,
  fee_percentage NUMERIC DEFAULT 0,
  fee_fixed NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create payment_transactions table for tracking all payments
CREATE TABLE public.payment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  gateway_id UUID NOT NULL REFERENCES public.payment_gateways(id),
  package_id UUID REFERENCES public.coin_packages(id),
  transaction_ref TEXT UNIQUE,
  gateway_transaction_id TEXT,
  amount_usd NUMERIC NOT NULL,
  amount_local NUMERIC NOT NULL,
  currency_code TEXT NOT NULL,
  coins_to_receive INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_data JSONB DEFAULT '{}',
  callback_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_gateways
CREATE POLICY "Anyone can view active payment gateways"
  ON public.payment_gateways FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage payment gateways"
  ON public.payment_gateways FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS policies for payment_transactions
CREATE POLICY "Users can view their own transactions"
  ON public.payment_transactions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own transactions"
  ON public.payment_transactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all transactions"
  ON public.payment_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update transactions"
  ON public.payment_transactions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_payment_gateways_updated_at
  BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some default payment gateways (inactive by default)
INSERT INTO public.payment_gateways (name, gateway_code, description, supported_currencies, display_order) VALUES
  ('bKash', 'bkash', 'বিকাশ পেমেন্ট গেটওয়ে', ARRAY['BDT'], 1),
  ('Nagad', 'nagad', 'নগদ পেমেন্ট গেটওয়ে', ARRAY['BDT'], 2),
  ('Rocket', 'rocket', 'রকেট পেমেন্ট গেটওয়ে', ARRAY['BDT'], 3),
  ('Stripe', 'stripe', 'International card payments', ARRAY['USD', 'EUR', 'GBP'], 4),
  ('PayPal', 'paypal', 'PayPal international payments', ARRAY['USD', 'EUR', 'GBP'], 5),
  ('UPI', 'upi', 'Unified Payments Interface (India)', ARRAY['INR'], 6),
  ('Paytm', 'paytm', 'Paytm wallet & payments (India)', ARRAY['INR'], 7),
  ('JazzCash', 'jazzcash', 'JazzCash mobile wallet (Pakistan)', ARRAY['PKR'], 8),
  ('EasyPaisa', 'easypaisa', 'EasyPaisa mobile wallet (Pakistan)', ARRAY['PKR'], 9);

-- Create index for faster lookups
CREATE INDEX idx_payment_transactions_user_id ON public.payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_status ON public.payment_transactions(status);
CREATE INDEX idx_payment_gateways_active ON public.payment_gateways(is_active);
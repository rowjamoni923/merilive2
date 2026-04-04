-- Add ePay and Binance payment gateways
INSERT INTO payment_gateways (name, gateway_code, description, supported_currencies, min_amount, max_amount, is_active, display_order)
SELECT 'ePay', 'epay', 'ePay পেমেন্ট গেটওয়ে', ARRAY['BDT', 'USD'], 1, 10000, true, 4
WHERE NOT EXISTS (SELECT 1 FROM payment_gateways WHERE gateway_code = 'epay');

INSERT INTO payment_gateways (name, gateway_code, description, supported_currencies, min_amount, max_amount, is_active, display_order)
SELECT 'Binance Pay', 'binance', 'Binance Pay ক্রিপ্টো পেমেন্ট', ARRAY['USD', 'USDT', 'BTC', 'ETH', 'BNB'], 1, 50000, true, 5
WHERE NOT EXISTS (SELECT 1 FROM payment_gateways WHERE gateway_code = 'binance');

-- Add helper-specific payment settings to topup_helpers
ALTER TABLE public.topup_helpers 
ADD COLUMN IF NOT EXISTS payment_credentials JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS auto_receive_orders BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS order_notification_email TEXT,
ADD COLUMN IF NOT EXISTS order_notification_phone TEXT;

-- Create helper_orders table for orders that go to specific helpers
CREATE TABLE IF NOT EXISTS public.helper_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id UUID NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  package_id UUID REFERENCES public.coin_packages(id),
  coin_amount INTEGER NOT NULL,
  amount_usd NUMERIC NOT NULL,
  amount_local NUMERIC NOT NULL,
  currency_code TEXT DEFAULT 'BDT',
  payment_method TEXT NOT NULL,
  payment_details JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  user_payment_proof TEXT,
  helper_notes TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.helper_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for helper_orders
CREATE POLICY "Users can view own orders"
  ON public.helper_orders FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create orders"
  ON public.helper_orders FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Helpers can view their orders"
  ON public.helper_orders FOR SELECT
  USING (helper_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid()));

CREATE POLICY "Helpers can update their orders"
  ON public.helper_orders FOR UPDATE
  USING (helper_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage all orders"
  ON public.helper_orders FOR ALL
  USING (public.is_admin(auth.uid()));

-- Function for helper to process order
CREATE OR REPLACE FUNCTION public.helper_process_order(_order_id UUID, _action TEXT, _notes TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order RECORD;
  _helper_user_id UUID;
BEGIN
  -- Get order and verify helper
  SELECT ho.*, th.user_id as helper_user_id 
  INTO _order
  FROM helper_orders ho
  JOIN topup_helpers th ON ho.helper_id = th.id
  WHERE ho.id = _order_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Verify caller is the helper or admin
  IF _order.helper_user_id != auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  IF _action = 'complete' THEN
    -- Mark order as completed
    UPDATE helper_orders
    SET status = 'completed', processed_at = now(), helper_notes = _notes
    WHERE id = _order_id;
    
    -- Add coins to user
    UPDATE profiles
    SET coins = COALESCE(coins, 0) + _order.coin_amount
    WHERE id = _order.user_id;
    
    -- Update helper stats
    UPDATE topup_helpers
    SET total_sold = COALESCE(total_sold, 0) + _order.coin_amount,
        total_earnings = COALESCE(total_earnings, 0) + _order.amount_usd
    WHERE id = _order.helper_id;
    
  ELSIF _action = 'reject' THEN
    UPDATE helper_orders
    SET status = 'cancelled', processed_at = now(), helper_notes = _notes
    WHERE id = _order_id;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_helper_orders_helper ON public.helper_orders(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_orders_user ON public.helper_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_helper_orders_status ON public.helper_orders(status);
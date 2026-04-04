-- Create topup_helpers table to track authorized coin traders
CREATE TABLE IF NOT EXISTS public.topup_helpers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  commission_rate NUMERIC DEFAULT 5,
  buy_rate NUMERIC DEFAULT 95, -- Price per 100 coins in cents (buy from platform)
  sell_rate NUMERIC DEFAULT 105, -- Price per 100 coins in cents (sell to users)
  total_bought BIGINT DEFAULT 0,
  total_sold BIGINT DEFAULT 0,
  total_earnings NUMERIC DEFAULT 0,
  wallet_balance NUMERIC DEFAULT 0,
  contact_info JSONB DEFAULT '{}',
  display_order INTEGER DEFAULT 0,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create helper_transactions table for tracking buys/sells
CREATE TABLE IF NOT EXISTS public.helper_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id UUID NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('buy_from_platform', 'sell_to_user', 'withdraw')),
  coin_amount INTEGER NOT NULL DEFAULT 0,
  usd_amount NUMERIC NOT NULL DEFAULT 0,
  local_amount NUMERIC DEFAULT 0,
  currency_code TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  payment_method TEXT,
  payment_details JSONB DEFAULT '{}',
  notes TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.topup_helpers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.helper_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for topup_helpers
CREATE POLICY "Anyone can view active helpers"
  ON public.topup_helpers FOR SELECT
  USING (is_active = true AND is_verified = true);

CREATE POLICY "Helpers can view own data"
  ON public.topup_helpers FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Helpers can update own data"
  ON public.topup_helpers FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage helpers"
  ON public.topup_helpers FOR ALL
  USING (public.is_admin(auth.uid()));

-- RLS Policies for helper_transactions
CREATE POLICY "Helpers can view own transactions"
  ON public.helper_transactions FOR SELECT
  USING (helper_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid()));

CREATE POLICY "Helpers can create transactions"
  ON public.helper_transactions FOR INSERT
  WITH CHECK (helper_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage transactions"
  ON public.helper_transactions FOR ALL
  USING (public.is_admin(auth.uid()));

-- Function to apply as helper
CREATE OR REPLACE FUNCTION public.apply_as_topup_helper(_contact_info JSONB DEFAULT '{}')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_id UUID;
BEGIN
  -- Check if already applied
  SELECT id INTO _helper_id FROM topup_helpers WHERE user_id = auth.uid();
  
  IF _helper_id IS NOT NULL THEN
    RETURN _helper_id;
  END IF;
  
  -- Create new application
  INSERT INTO topup_helpers (user_id, contact_info)
  VALUES (auth.uid(), _contact_info)
  RETURNING id INTO _helper_id;
  
  RETURN _helper_id;
END;
$$;

-- Function for helper to buy coins from platform
CREATE OR REPLACE FUNCTION public.helper_buy_coins(_amount INTEGER, _payment_method TEXT, _payment_details JSONB DEFAULT '{}')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper RECORD;
  _transaction_id UUID;
  _usd_amount NUMERIC;
  _settings JSONB;
  _buy_rate NUMERIC;
BEGIN
  -- Get helper info
  SELECT * INTO _helper FROM topup_helpers WHERE user_id = auth.uid() AND is_active = true AND is_verified = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized as helper';
  END IF;
  
  -- Get platform buy rate from settings
  SELECT setting_value INTO _settings FROM app_settings WHERE setting_key = 'coin_trader_settings';
  _buy_rate := COALESCE((_settings->>'platform_buy_rate')::NUMERIC, 0.95);
  
  -- Calculate USD amount (rate is per 100 coins)
  _usd_amount := (_amount / 100.0) * _buy_rate;
  
  -- Create transaction
  INSERT INTO helper_transactions (
    helper_id, transaction_type, coin_amount, usd_amount, payment_method, payment_details, status
  ) VALUES (
    _helper.id, 'buy_from_platform', _amount, _usd_amount, _payment_method, _payment_details, 'pending'
  ) RETURNING id INTO _transaction_id;
  
  RETURN _transaction_id;
END;
$$;

-- Admin function to approve helper
CREATE OR REPLACE FUNCTION public.admin_approve_helper(_helper_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  UPDATE topup_helpers
  SET is_verified = true, is_active = true, approved_at = now(), approved_by = auth.uid()
  WHERE id = _helper_id;
  
  RETURN TRUE;
END;
$$;

-- Admin function to process helper transaction
CREATE OR REPLACE FUNCTION public.admin_process_helper_transaction(_transaction_id UUID, _action TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _txn RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  SELECT * INTO _txn FROM helper_transactions WHERE id = _transaction_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  IF _action = 'approve' AND _txn.transaction_type = 'buy_from_platform' THEN
    -- Update transaction
    UPDATE helper_transactions
    SET status = 'completed', processed_at = now(), processed_by = auth.uid()
    WHERE id = _transaction_id;
    
    -- Add coins to helper wallet
    UPDATE topup_helpers
    SET wallet_balance = wallet_balance + _txn.coin_amount,
        total_bought = total_bought + _txn.coin_amount
    WHERE id = _txn.helper_id;
    
  ELSIF _action = 'reject' THEN
    UPDATE helper_transactions
    SET status = 'failed', processed_at = now(), processed_by = auth.uid()
    WHERE id = _transaction_id;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Add coin_trader_settings to app_settings if not exists
INSERT INTO app_settings (setting_key, setting_value, category, description)
SELECT 'coin_trader_settings', 
  '{"platform_buy_rate": 0.95, "helper_sell_rate": 1.05, "min_buy_amount": 10000, "max_buy_amount": 1000000}'::JSONB,
  'trading',
  'Settings for topup helper/coin trader system'
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'coin_trader_settings');

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_topup_helpers_active ON public.topup_helpers(is_active, is_verified);
CREATE INDEX IF NOT EXISTS idx_helper_transactions_helper ON public.helper_transactions(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_transactions_status ON public.helper_transactions(status);
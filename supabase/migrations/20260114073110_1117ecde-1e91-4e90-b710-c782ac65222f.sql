-- Create table for agency earnings transfers
CREATE TABLE IF NOT EXISTS public.agency_earnings_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  host_id UUID NOT NULL REFERENCES profiles(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  transfer_type TEXT NOT NULL DEFAULT 'weekly', -- weekly, manual
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.agency_earnings_transfers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Agency owners can view their transfers" 
ON public.agency_earnings_transfers 
FOR SELECT 
USING (
  agency_id IN (SELECT id FROM agencies WHERE owner_id = auth.uid())
);

-- Create table for agency withdrawals
CREATE TABLE IF NOT EXISTS public.agency_withdrawals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES agencies(id),
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, completed
  payment_method TEXT,
  payment_details JSONB,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID,
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.agency_withdrawals ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Agency owners can view their withdrawals" 
ON public.agency_withdrawals 
FOR SELECT 
USING (
  agency_id IN (SELECT id FROM agencies WHERE owner_id = auth.uid())
);

CREATE POLICY "Agency owners can create withdrawal requests" 
ON public.agency_withdrawals 
FOR INSERT 
WITH CHECK (
  agency_id IN (SELECT id FROM agencies WHERE owner_id = auth.uid())
);

-- Add pending_earnings column to profiles for tracking host earnings before transfer
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS pending_earnings NUMERIC DEFAULT 0;

-- Create function for weekly agency transfer
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency RECORD;
  _host RECORD;
  _agency_commission_percent NUMERIC;
  _host_earnings NUMERIC;
  _agency_earnings NUMERIC;
  _total_transfers INT := 0;
  _total_amount NUMERIC := 0;
  _settings JSONB;
BEGIN
  -- Get agency commission percentage from settings
  SELECT setting_value INTO _settings
  FROM app_settings
  WHERE setting_key = 'agency_commission';
  
  _agency_commission_percent := COALESCE((_settings->>'agency_percent')::NUMERIC, 10);
  
  -- Loop through all active agencies
  FOR _agency IN 
    SELECT a.id, a.owner_id, a.commission_rate
    FROM agencies a
    WHERE a.is_active = true AND a.is_blocked = false
  LOOP
    -- Loop through all hosts in this agency
    FOR _host IN
      SELECT ah.host_id, p.total_earnings, p.pending_earnings
      FROM agency_hosts ah
      JOIN profiles p ON p.id = ah.host_id
      WHERE ah.agency_id = _agency.id 
        AND ah.status = 'active'
        AND COALESCE(p.total_earnings, 0) > 0
    LOOP
      _host_earnings := COALESCE(_host.total_earnings, 0);
      
      IF _host_earnings > 0 THEN
        -- Calculate agency commission from host earnings
        _agency_earnings := FLOOR(_host_earnings * _agency_commission_percent / 100);
        
        -- Create transfer record
        INSERT INTO agency_earnings_transfers (
          agency_id, host_id, amount, transfer_type, 
          period_start, period_end, status, processed_at
        ) VALUES (
          _agency.id, _host.host_id, _agency_earnings, 'weekly',
          now() - interval '7 days', now(), 'completed', now()
        );
        
        -- Add to agency wallet
        UPDATE agencies
        SET wallet_balance = COALESCE(wallet_balance, 0) + _agency_earnings
        WHERE id = _agency.id;
        
        -- Reset host earnings after transfer
        UPDATE profiles
        SET total_earnings = 0,
            pending_earnings = COALESCE(pending_earnings, 0) + COALESCE(total_earnings, 0)
        WHERE id = _host.host_id;
        
        _total_transfers := _total_transfers + 1;
        _total_amount := _total_amount + _agency_earnings;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'total_transfers', _total_transfers,
    'total_amount', _total_amount,
    'processed_at', now()
  );
END;
$$;

-- Create function for agency withdrawal request
CREATE OR REPLACE FUNCTION public.request_agency_withdrawal(
  _agency_id UUID,
  _amount NUMERIC,
  _payment_method TEXT DEFAULT 'bank',
  _payment_details JSONB DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency RECORD;
  _withdrawal_id UUID;
BEGIN
  -- Check if user owns this agency
  SELECT * INTO _agency
  FROM agencies
  WHERE id = _agency_id AND owner_id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Agency not found or not authorized');
  END IF;
  
  -- Check if agency has enough balance
  IF COALESCE(_agency.wallet_balance, 0) < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;
  
  -- Check for pending withdrawals
  IF EXISTS (
    SELECT 1 FROM agency_withdrawals 
    WHERE agency_id = _agency_id AND status = 'pending'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'You have a pending withdrawal request');
  END IF;
  
  -- Create withdrawal request
  INSERT INTO agency_withdrawals (
    agency_id, amount, payment_method, payment_details, status
  ) VALUES (
    _agency_id, _amount, _payment_method, _payment_details, 'pending'
  ) RETURNING id INTO _withdrawal_id;
  
  -- Deduct from agency wallet (hold)
  UPDATE agencies
  SET wallet_balance = wallet_balance - _amount
  WHERE id = _agency_id;
  
  RETURN json_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'amount', _amount
  );
END;
$$;
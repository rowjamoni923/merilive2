-- Create agency_commission_history table to track all commission earnings
CREATE TABLE IF NOT EXISTS public.agency_commission_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL DEFAULT 'gift',
  original_amount NUMERIC NOT NULL DEFAULT 0,
  commission_rate NUMERIC NOT NULL DEFAULT 2,
  commission_amount NUMERIC NOT NULL DEFAULT 0,
  source_transaction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.agency_commission_history ENABLE ROW LEVEL SECURITY;

-- Agency owners can see their commission history
CREATE POLICY "Agency owners can view their commission history"
ON public.agency_commission_history
FOR SELECT
USING (
  agency_id IN (
    SELECT id FROM agencies WHERE owner_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_agency_commission_history_agency ON public.agency_commission_history(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_commission_history_host ON public.agency_commission_history(host_id);
CREATE INDEX IF NOT EXISTS idx_agency_commission_history_created ON public.agency_commission_history(created_at DESC);

-- Function to auto-calculate and credit agency commission when host earns from gifts
CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission()
RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _agency_commission_rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
BEGIN
  -- Get host's agency
  SELECT ah.agency_id INTO _host_agency_id
  FROM agency_hosts ah
  WHERE ah.host_id = NEW.receiver_id
    AND ah.status = 'active'
  LIMIT 1;
  
  -- If host is not in any agency, exit
  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get agency's commission rate (default 2%)
  SELECT COALESCE(commission_rate, 2) INTO _agency_commission_rate
  FROM agencies
  WHERE id = _host_agency_id;
  
  -- Calculate host earnings (40% of coin value)
  _host_earnings := FLOOR(NEW.coin_amount * 40 / 100);
  
  -- Calculate agency commission from host earnings
  _commission_amount := FLOOR(_host_earnings * _agency_commission_rate / 100);
  
  IF _commission_amount > 0 THEN
    -- Credit commission to agency's beans_balance
    UPDATE agencies
    SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
    WHERE id = _host_agency_id;
    
    -- Record in commission history
    INSERT INTO agency_commission_history (
      agency_id, host_id, transaction_type, original_amount,
      commission_rate, commission_amount, source_transaction_id, notes
    ) VALUES (
      _host_agency_id, NEW.receiver_id, 'gift', _host_earnings,
      _agency_commission_rate, _commission_amount, NEW.id,
      'Auto commission from gift: ' || NEW.coin_amount || ' coins'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-credit agency commission on every gift transaction
DROP TRIGGER IF EXISTS trigger_auto_agency_commission ON gift_transactions;
CREATE TRIGGER trigger_auto_agency_commission
  AFTER INSERT ON gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION auto_credit_agency_commission();

-- Function to auto-credit agency commission from call earnings
CREATE OR REPLACE FUNCTION public.auto_credit_agency_commission_from_call()
RETURNS TRIGGER AS $$
DECLARE
  _host_agency_id UUID;
  _agency_commission_rate NUMERIC;
  _commission_amount NUMERIC;
  _host_earnings NUMERIC;
  _host_commission_rate NUMERIC;
BEGIN
  -- Only process when call ends
  IF NEW.status NOT IN ('ended', 'completed') OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Get host's agency
  SELECT ah.agency_id INTO _host_agency_id
  FROM agency_hosts ah
  WHERE ah.host_id = NEW.host_id
    AND ah.status = 'active'
  LIMIT 1;
  
  -- If host is not in any agency, exit
  IF _host_agency_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get host commission rate from settings (default 50%)
  SELECT COALESCE((setting_value->>'host_commission_percent')::NUMERIC, 50)
  INTO _host_commission_rate
  FROM app_settings
  WHERE setting_key = 'call_rates';
  
  IF _host_commission_rate IS NULL THEN
    _host_commission_rate := 50;
  END IF;
  
  -- Calculate host earnings from call
  _host_earnings := FLOOR(COALESCE(NEW.coins_spent, 0) * _host_commission_rate / 100);
  
  -- Get agency's commission rate
  SELECT COALESCE(commission_rate, 2) INTO _agency_commission_rate
  FROM agencies
  WHERE id = _host_agency_id;
  
  -- Calculate agency commission
  _commission_amount := FLOOR(_host_earnings * _agency_commission_rate / 100);
  
  IF _commission_amount > 0 THEN
    -- Credit commission to agency
    UPDATE agencies
    SET beans_balance = COALESCE(beans_balance, 0) + _commission_amount
    WHERE id = _host_agency_id;
    
    -- Record in commission history
    INSERT INTO agency_commission_history (
      agency_id, host_id, transaction_type, original_amount,
      commission_rate, commission_amount, source_transaction_id, notes
    ) VALUES (
      _host_agency_id, NEW.host_id, 'call', _host_earnings,
      _agency_commission_rate, _commission_amount, NEW.id,
      'Auto commission from call: ' || COALESCE(NEW.coins_spent, 0) || ' coins spent'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for call commission
DROP TRIGGER IF EXISTS trigger_auto_agency_commission_call ON private_calls;
CREATE TRIGGER trigger_auto_agency_commission_call
  AFTER UPDATE ON private_calls
  FOR EACH ROW
  EXECUTE FUNCTION auto_credit_agency_commission_from_call();
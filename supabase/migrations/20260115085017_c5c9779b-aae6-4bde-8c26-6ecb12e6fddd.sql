-- Add trader_level column to topup_helpers table
ALTER TABLE public.topup_helpers 
ADD COLUMN IF NOT EXISTS trader_level integer DEFAULT 1 CHECK (trader_level >= 1 AND trader_level <= 5);

-- Add payroll_enabled column (only Level 5 traders can have this enabled)
ALTER TABLE public.topup_helpers 
ADD COLUMN IF NOT EXISTS payroll_enabled boolean DEFAULT false;

-- Add level_upgrade_cost column to track what they paid for upgrades
ALTER TABLE public.topup_helpers 
ADD COLUMN IF NOT EXISTS total_level_upgrade_cost numeric DEFAULT 0;

-- Create trader level tiers table
CREATE TABLE IF NOT EXISTS public.trader_level_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_number integer UNIQUE NOT NULL CHECK (level_number >= 1 AND level_number <= 5),
  level_name text NOT NULL,
  upgrade_cost_usd numeric NOT NULL DEFAULT 0,
  min_withdrawal_amount numeric DEFAULT 5000,
  max_withdrawal_amount numeric DEFAULT 100000,
  commission_rate numeric DEFAULT 0,
  badge_color text DEFAULT '#6366f1',
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Insert default trader levels
INSERT INTO public.trader_level_tiers (level_number, level_name, upgrade_cost_usd, min_withdrawal_amount, max_withdrawal_amount, commission_rate, badge_color, description)
VALUES 
  (1, 'Bronze Trader', 0, 0, 0, 0, '#CD7F32', 'Basic trader - Can transfer to users only'),
  (2, 'Silver Trader', 100, 0, 0, 0, '#C0C0C0', 'Silver trader - Can transfer to users and agencies'),
  (3, 'Gold Trader', 300, 0, 0, 0.5, '#FFD700', 'Gold trader - Enhanced limits'),
  (4, 'Platinum Trader', 500, 0, 0, 1, '#E5E4E2', 'Platinum trader - High limits'),
  (5, 'Diamond Trader', 1000, 5000, 100000, 2, '#B9F2FF', 'Diamond trader - Payroll access enabled')
ON CONFLICT (level_number) DO NOTHING;

-- Create payroll_requests table for agency withdrawals that go to Level 5 traders
CREATE TABLE IF NOT EXISTS public.payroll_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE NOT NULL,
  trader_id uuid REFERENCES public.topup_helpers(id) ON DELETE SET NULL,
  beans_amount numeric NOT NULL,
  usd_amount numeric NOT NULL,
  payment_method text,
  payment_details jsonb,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'processing', 'completed', 'rejected', 'cancelled')),
  assigned_at timestamptz,
  processed_at timestamptz,
  notes text,
  agency_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on payroll_requests
ALTER TABLE public.payroll_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for payroll_requests
CREATE POLICY "Agency owners can view their payroll requests"
  ON public.payroll_requests FOR SELECT
  USING (
    agency_id IN (SELECT id FROM public.agencies WHERE owner_id = auth.uid())
  );

CREATE POLICY "Agency owners can create payroll requests"
  ON public.payroll_requests FOR INSERT
  WITH CHECK (
    agency_id IN (SELECT id FROM public.agencies WHERE owner_id = auth.uid())
  );

CREATE POLICY "Level 5 traders can view assigned payroll requests"
  ON public.payroll_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.topup_helpers 
      WHERE user_id = auth.uid() 
      AND trader_level = 5 
      AND payroll_enabled = true
      AND is_verified = true
    )
  );

CREATE POLICY "Level 5 traders can update their assigned payroll requests"
  ON public.payroll_requests FOR UPDATE
  USING (
    trader_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid() AND trader_level = 5)
  );

-- Create trader_level_purchases table
CREATE TABLE IF NOT EXISTS public.trader_level_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id uuid REFERENCES public.topup_helpers(id) ON DELETE CASCADE NOT NULL,
  from_level integer NOT NULL,
  to_level integer NOT NULL,
  cost_usd numeric NOT NULL,
  payment_method text,
  payment_proof text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes text,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on trader_level_purchases
ALTER TABLE public.trader_level_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Traders can view their own level purchases"
  ON public.trader_level_purchases FOR SELECT
  USING (trader_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid()));

CREATE POLICY "Traders can create level purchases"
  ON public.trader_level_purchases FOR INSERT
  WITH CHECK (trader_id IN (SELECT id FROM public.topup_helpers WHERE user_id = auth.uid()));

-- Function to assign payroll request to random Level 5 trader
CREATE OR REPLACE FUNCTION public.assign_payroll_to_trader(
  _request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trader_id uuid;
  _request record;
BEGIN
  -- Get the request
  SELECT * INTO _request FROM payroll_requests WHERE id = _request_id AND status = 'pending';
  
  IF _request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already assigned');
  END IF;
  
  -- Find a random Level 5 trader with payroll enabled
  SELECT id INTO _trader_id
  FROM topup_helpers
  WHERE trader_level = 5 
    AND payroll_enabled = true 
    AND is_verified = true
  ORDER BY RANDOM()
  LIMIT 1;
  
  IF _trader_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No Level 5 traders available');
  END IF;
  
  -- Assign the request
  UPDATE payroll_requests 
  SET trader_id = _trader_id, 
      status = 'assigned',
      assigned_at = now(),
      updated_at = now()
  WHERE id = _request_id;
  
  RETURN jsonb_build_object('success', true, 'trader_id', _trader_id);
END;
$$;

-- Function to automatically distribute payroll requests equally
CREATE OR REPLACE FUNCTION public.distribute_payroll_requests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trader record;
  _min_count integer;
BEGIN
  -- Find the Level 5 trader with fewest pending requests
  SELECT th.id, COUNT(pr.id) as request_count
  INTO _trader
  FROM topup_helpers th
  LEFT JOIN payroll_requests pr ON pr.trader_id = th.id AND pr.status IN ('assigned', 'processing')
  WHERE th.trader_level = 5 
    AND th.payroll_enabled = true 
    AND th.is_verified = true
  GROUP BY th.id
  ORDER BY request_count ASC
  LIMIT 1;
  
  IF _trader IS NOT NULL THEN
    NEW.trader_id := _trader.id;
    NEW.status := 'assigned';
    NEW.assigned_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-assign payroll requests
DROP TRIGGER IF EXISTS auto_assign_payroll ON payroll_requests;
CREATE TRIGGER auto_assign_payroll
  BEFORE INSERT ON payroll_requests
  FOR EACH ROW
  EXECUTE FUNCTION distribute_payroll_requests();
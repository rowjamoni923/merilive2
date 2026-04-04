-- Create sub-agents table for referral system
CREATE TABLE IF NOT EXISTS public.sub_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  referrer_id UUID REFERENCES public.profiles(id),
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  commission_rate NUMERIC DEFAULT 2,
  total_referrals INTEGER DEFAULT 0,
  total_earnings NUMERIC DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create sub-agent referral tracking table
CREATE TABLE IF NOT EXISTS public.sub_agent_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_agent_id UUID NOT NULL REFERENCES public.sub_agents(id) ON DELETE CASCADE,
  referred_host_id UUID NOT NULL REFERENCES public.profiles(id),
  commission_earned NUMERIC DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  referred_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create sub-agent commission history table
CREATE TABLE IF NOT EXISTS public.sub_agent_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sub_agent_id UUID NOT NULL REFERENCES public.sub_agents(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES public.profiles(id),
  gift_transaction_id UUID REFERENCES public.gift_transactions(id),
  commission_amount NUMERIC NOT NULL,
  commission_rate NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sub_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_agent_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_agent_commissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sub_agents
CREATE POLICY "Users can view their own sub-agent profile"
  ON public.sub_agents FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() IN (
    SELECT owner_id FROM agencies WHERE id = agency_id
  ));

CREATE POLICY "Agency owners can manage sub-agents"
  ON public.sub_agents FOR ALL
  USING (auth.uid() IN (
    SELECT owner_id FROM agencies WHERE id = agency_id
  ));

-- RLS Policies for sub_agent_referrals
CREATE POLICY "Sub-agents can view their referrals"
  ON public.sub_agent_referrals FOR SELECT
  USING (auth.uid() IN (
    SELECT user_id FROM sub_agents WHERE id = sub_agent_id
  ));

CREATE POLICY "Agency owners can view all referrals"
  ON public.sub_agent_referrals FOR SELECT
  USING (auth.uid() IN (
    SELECT a.owner_id FROM agencies a 
    JOIN sub_agents sa ON sa.agency_id = a.id 
    WHERE sa.id = sub_agent_id
  ));

-- RLS Policies for sub_agent_commissions
CREATE POLICY "Sub-agents can view their commissions"
  ON public.sub_agent_commissions FOR SELECT
  USING (auth.uid() IN (
    SELECT user_id FROM sub_agents WHERE id = sub_agent_id
  ));

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sub_agents_agency ON public.sub_agents(agency_id);
CREATE INDEX IF NOT EXISTS idx_sub_agents_user ON public.sub_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_referrals_sub_agent ON public.sub_agent_referrals(sub_agent_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_commissions_sub_agent ON public.sub_agent_commissions(sub_agent_id);

-- Function to generate unique referral code
CREATE OR REPLACE FUNCTION public.generate_sub_agent_referral_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := 'SA';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to create sub-agent
CREATE OR REPLACE FUNCTION public.create_sub_agent(
  _agency_id UUID,
  _user_id UUID,
  _referrer_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  _referral_code TEXT;
  _sub_agent_id UUID;
BEGIN
  -- Generate unique referral code
  _referral_code := public.generate_sub_agent_referral_code();
  
  -- Ensure uniqueness
  WHILE EXISTS (SELECT 1 FROM sub_agents WHERE referral_code = _referral_code) LOOP
    _referral_code := public.generate_sub_agent_referral_code();
  END LOOP;
  
  -- Insert sub-agent
  INSERT INTO sub_agents (agency_id, user_id, referrer_id, referral_code)
  VALUES (_agency_id, _user_id, _referrer_id, _referral_code)
  RETURNING id INTO _sub_agent_id;
  
  RETURN _sub_agent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
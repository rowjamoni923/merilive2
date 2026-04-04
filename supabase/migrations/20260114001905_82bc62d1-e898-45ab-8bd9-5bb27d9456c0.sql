-- Create agencies table
CREATE TABLE public.agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  agency_code TEXT UNIQUE NOT NULL,
  level TEXT DEFAULT 'A1',
  total_hosts INTEGER DEFAULT 0,
  total_agents INTEGER DEFAULT 0,
  wallet_balance INTEGER DEFAULT 0,
  commission_rate DECIMAL(5,2) DEFAULT 4.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create agency_hosts table (links hosts to agencies)
CREATE TABLE public.agency_hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE NOT NULL,
  host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  joined_via TEXT DEFAULT 'invitation', -- 'link', 'invitation', 'manual'
  referral_code TEXT,
  status TEXT DEFAULT 'active', -- 'active', 'pending', 'suspended'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(host_id) -- A host can only belong to one agency
);

-- Add host-related fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_host BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS host_status TEXT DEFAULT NULL, -- 'pending', 'approved', 'rejected'
ADD COLUMN IF NOT EXISTS host_level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS total_earnings INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_hosts ENABLE ROW LEVEL SECURITY;

-- Agencies policies
CREATE POLICY "Anyone can view active agencies" 
ON public.agencies 
FOR SELECT 
USING (is_active = true);

CREATE POLICY "Agency owners can update their agency" 
ON public.agencies 
FOR UPDATE 
USING (auth.uid() = owner_id);

CREATE POLICY "Authenticated users can create agency" 
ON public.agencies 
FOR INSERT 
WITH CHECK (auth.uid() = owner_id);

-- Agency hosts policies
CREATE POLICY "Agency owners can view their hosts" 
ON public.agency_hosts 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.agencies 
    WHERE id = agency_id AND owner_id = auth.uid()
  )
  OR host_id = auth.uid()
);

CREATE POLICY "Users can join agencies" 
ON public.agency_hosts 
FOR INSERT 
WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Agency owners can manage hosts" 
ON public.agency_hosts 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.agencies 
    WHERE id = agency_id AND owner_id = auth.uid()
  )
);

CREATE POLICY "Users can leave agency" 
ON public.agency_hosts 
FOR DELETE 
USING (auth.uid() = host_id);

-- Function to get agency by code
CREATE OR REPLACE FUNCTION public.get_agency_by_code(agency_code TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  level TEXT,
  total_hosts INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, level, total_hosts
  FROM public.agencies
  WHERE agencies.agency_code = get_agency_by_code.agency_code
  AND is_active = true
  LIMIT 1;
$$;

-- Function to join agency
CREATE OR REPLACE FUNCTION public.join_agency(
  _host_id UUID,
  _agency_code TEXT,
  _joined_via TEXT DEFAULT 'invitation'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_id UUID;
BEGIN
  -- Get agency id from code
  SELECT id INTO _agency_id
  FROM public.agencies
  WHERE agency_code = _agency_code
  AND is_active = true;
  
  IF _agency_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if already in an agency
  IF EXISTS (SELECT 1 FROM public.agency_hosts WHERE host_id = _host_id) THEN
    RETURN FALSE;
  END IF;
  
  -- Insert into agency_hosts
  INSERT INTO public.agency_hosts (agency_id, host_id, joined_via, referral_code)
  VALUES (_agency_id, _host_id, _joined_via, _agency_code);
  
  -- Update profile with agency_id
  UPDATE public.profiles
  SET agency_id = _agency_id
  WHERE id = _host_id;
  
  -- Increment agency host count
  UPDATE public.agencies
  SET total_hosts = total_hosts + 1
  WHERE id = _agency_id;
  
  RETURN TRUE;
END;
$$;

-- Insert a sample agency for testing
INSERT INTO public.agencies (name, agency_code, level, owner_id)
VALUES ('🅡🅙✨Guru✨Agency', 'GURU2024', 'A1', NULL);

-- Trigger to update updated_at
CREATE TRIGGER update_agencies_updated_at
BEFORE UPDATE ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
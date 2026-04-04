-- Agency Rankings table for storing weekly/monthly rankings
CREATE TABLE public.agency_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE NOT NULL,
  ranking_type TEXT NOT NULL, -- 'golden_host_income', 'new_host', 'host_duration', 'golden_host'
  period_type TEXT NOT NULL, -- 'weekly', 'monthly'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rank_position INTEGER NOT NULL,
  metric_value DECIMAL(15,2) DEFAULT 0, -- income, hours, count depending on type
  country_code TEXT,
  country_flag TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Agency Performance Stats (updated in real-time)
CREATE TABLE public.agency_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE NOT NULL,
  period_type TEXT NOT NULL, -- 'weekly', 'monthly'
  period_start DATE NOT NULL,
  total_income DECIMAL(15,2) DEFAULT 0,
  new_hosts_count INTEGER DEFAULT 0,
  total_host_hours DECIMAL(10,2) DEFAULT 0,
  golden_host_income DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(agency_id, period_type, period_start)
);

-- Ranking Rewards Configuration
CREATE TABLE public.ranking_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ranking_type TEXT NOT NULL,
  period_type TEXT NOT NULL, -- 'weekly', 'monthly'
  rank_position INTEGER NOT NULL,
  reward_coins INTEGER DEFAULT 0,
  reward_badge TEXT,
  min_income_requirement DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(ranking_type, period_type, rank_position)
);

-- Add is_agency_owner to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_agency_owner BOOLEAN DEFAULT false;

-- Enable RLS
ALTER TABLE public.agency_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_rewards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view rankings" 
ON public.agency_rankings 
FOR SELECT 
USING (true);

CREATE POLICY "System can manage rankings" 
ON public.agency_rankings 
FOR ALL 
USING (true);

CREATE POLICY "Anyone can view performance" 
ON public.agency_performance 
FOR SELECT 
USING (true);

CREATE POLICY "Agency owners can update own performance" 
ON public.agency_performance 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.agencies 
    WHERE id = agency_id AND owner_id = auth.uid()
  )
);

CREATE POLICY "Anyone can view rewards config" 
ON public.ranking_rewards 
FOR SELECT 
USING (true);

-- Insert default ranking rewards for Golden Host Income (Weekly)
INSERT INTO public.ranking_rewards (ranking_type, period_type, rank_position, reward_coins, min_income_requirement) VALUES
('golden_host_income', 'weekly', 1, 1000000, 50000000),
('golden_host_income', 'weekly', 2, 500000, 40000000),
('golden_host_income', 'weekly', 3, 300000, 30000000),
('golden_host_income', 'weekly', 4, 200000, 25000000),
('golden_host_income', 'weekly', 5, 150000, 20000000),
('golden_host_income', 'weekly', 6, 150000, 20000000),
('golden_host_income', 'weekly', 7, 150000, 20000000),
('golden_host_income', 'weekly', 8, 100000, 15000000),
('golden_host_income', 'weekly', 9, 100000, 15000000),
('golden_host_income', 'weekly', 10, 100000, 15000000);

-- Insert rewards for New Host (Weekly)
INSERT INTO public.ranking_rewards (ranking_type, period_type, rank_position, reward_coins, reward_badge) VALUES
('new_host', 'weekly', 1, 0, 'Recruiter King'),
('new_host', 'weekly', 2, 0, 'Recruiter Prince'),
('new_host', 'weekly', 3, 0, 'Recruiter Duke'),
('new_host', 'weekly', 4, 0, 'Recruiter Tops'),
('new_host', 'weekly', 5, 0, 'Recruiter Tops'),
('new_host', 'weekly', 6, 0, 'Recruiter Tops'),
('new_host', 'weekly', 7, 0, 'Recruiter Tops'),
('new_host', 'weekly', 8, 0, 'Recruiter Tops'),
('new_host', 'weekly', 9, 0, 'Recruiter Tops'),
('new_host', 'weekly', 10, 0, 'Recruiter Tops');

-- Insert rewards for Host Duration (Weekly)
INSERT INTO public.ranking_rewards (ranking_type, period_type, rank_position, reward_coins, reward_badge) VALUES
('host_duration', 'weekly', 1, 0, 'Duration King'),
('host_duration', 'weekly', 2, 0, 'Duration Prince'),
('host_duration', 'weekly', 3, 0, 'Duration Duke'),
('host_duration', 'weekly', 4, 0, 'Duration Tops'),
('host_duration', 'weekly', 5, 0, 'Duration Tops'),
('host_duration', 'weekly', 6, 0, 'Duration Tops'),
('host_duration', 'weekly', 7, 0, 'Duration Tops'),
('host_duration', 'weekly', 8, 0, 'Duration Tops'),
('host_duration', 'weekly', 9, 0, 'Duration Tops'),
('host_duration', 'weekly', 10, 0, 'Duration Tops');

-- Insert rewards for Golden Host (Weekly)
INSERT INTO public.ranking_rewards (ranking_type, period_type, rank_position, reward_coins, min_income_requirement) VALUES
('golden_host', 'weekly', 1, 300000, 15000000),
('golden_host', 'weekly', 2, 150000, 15000000),
('golden_host', 'weekly', 3, 100000, 15000000),
('golden_host', 'weekly', 4, 80000, 10000000),
('golden_host', 'weekly', 5, 80000, 10000000),
('golden_host', 'weekly', 6, 80000, 10000000),
('golden_host', 'weekly', 7, 60000, 5000000),
('golden_host', 'weekly', 8, 60000, 5000000),
('golden_host', 'weekly', 9, 50000, 5000000),
('golden_host', 'weekly', 10, 50000, 5000000);

-- Insert sample agency performance data
INSERT INTO public.agency_performance (agency_id, period_type, period_start, total_income, new_hosts_count, total_host_hours, golden_host_income)
SELECT 
  id,
  'weekly',
  date_trunc('week', CURRENT_DATE)::date,
  4500000,
  17,
  0,
  0
FROM public.agencies WHERE agency_code = 'GURU2024';

-- Function to get agency rankings
CREATE OR REPLACE FUNCTION public.get_agency_rankings(
  _ranking_type TEXT,
  _period_type TEXT,
  _limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  rank_position INTEGER,
  agency_id UUID,
  agency_name TEXT,
  agency_code TEXT,
  owner_avatar TEXT,
  country_code TEXT,
  country_flag TEXT,
  metric_value DECIMAL,
  total_hosts INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ROW_NUMBER() OVER (ORDER BY 
      CASE _ranking_type
        WHEN 'golden_host_income' THEN ap.golden_host_income
        WHEN 'new_host' THEN ap.new_hosts_count::DECIMAL
        WHEN 'host_duration' THEN ap.total_host_hours
        ELSE ap.total_income
      END DESC
    )::INTEGER as rank_position,
    a.id as agency_id,
    a.name as agency_name,
    a.agency_code,
    p.avatar_url as owner_avatar,
    p.country_code,
    p.country_flag,
    CASE _ranking_type
      WHEN 'golden_host_income' THEN ap.golden_host_income
      WHEN 'new_host' THEN ap.new_hosts_count::DECIMAL
      WHEN 'host_duration' THEN ap.total_host_hours
      ELSE ap.total_income
    END as metric_value,
    a.total_hosts
  FROM public.agencies a
  LEFT JOIN public.agency_performance ap ON a.id = ap.agency_id 
    AND ap.period_type = _period_type
    AND ap.period_start = date_trunc('week', CURRENT_DATE)::date
  LEFT JOIN public.profiles p ON a.owner_id = p.id
  WHERE a.is_active = true
  ORDER BY metric_value DESC NULLS LAST
  LIMIT _limit;
$$;

-- Trigger to update updated_at
CREATE TRIGGER update_agency_rankings_updated_at
BEFORE UPDATE ON public.agency_rankings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agency_performance_updated_at
BEFORE UPDATE ON public.agency_performance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
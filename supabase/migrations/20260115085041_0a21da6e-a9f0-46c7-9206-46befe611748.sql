-- Enable RLS on trader_level_tiers
ALTER TABLE public.trader_level_tiers ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read trader level tiers
CREATE POLICY "Everyone can view trader level tiers"
  ON public.trader_level_tiers FOR SELECT
  USING (true);
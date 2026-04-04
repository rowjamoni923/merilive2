-- Add logo_url column to agencies table
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create agency level system table
CREATE TABLE IF NOT EXISTS public.agency_level_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level_code VARCHAR(10) NOT NULL UNIQUE, -- A1, A2, A3, A4, A5
  level_name VARCHAR(50) NOT NULL,
  min_weekly_income INTEGER NOT NULL DEFAULT 0,
  max_weekly_income INTEGER NOT NULL DEFAULT 999999999,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 2.0,
  badge_color VARCHAR(50) DEFAULT 'bronze',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agency_level_tiers ENABLE ROW LEVEL SECURITY;

-- Create policy for reading (everyone can read)
CREATE POLICY "Anyone can view agency level tiers"
ON public.agency_level_tiers
FOR SELECT
USING (true);

-- Create policy for admin updates
CREATE POLICY "Only admins can modify agency level tiers"
ON public.agency_level_tiers
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_verified = true
  )
);

-- Insert default level tiers
INSERT INTO public.agency_level_tiers (level_code, level_name, min_weekly_income, max_weekly_income, commission_rate, badge_color, display_order)
VALUES 
  ('A1', 'Starter', 0, 49999, 2.0, 'bronze', 1),
  ('A2', 'Rising', 50000, 99999, 3.0, 'silver', 2),
  ('A3', 'Pro', 100000, 249999, 4.0, 'gold', 3),
  ('A4', 'Elite', 250000, 499999, 5.0, 'platinum', 4),
  ('A5', 'Legend', 500000, 999999999, 7.0, 'diamond', 5)
ON CONFLICT (level_code) DO NOTHING;

-- Create function to auto-update agency level based on weekly income
CREATE OR REPLACE FUNCTION public.update_agency_level()
RETURNS TRIGGER AS $$
DECLARE
  weekly_income NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
BEGIN
  -- Calculate weekly income for the agency
  SELECT COALESCE(SUM(total_income), 0) INTO weekly_income
  FROM public.agency_performance
  WHERE agency_id = NEW.id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now());

  -- Get appropriate level based on income
  SELECT level_code, commission_rate 
  INTO new_level_code, new_commission_rate
  FROM public.agency_level_tiers
  WHERE weekly_income >= min_weekly_income 
    AND weekly_income <= max_weekly_income
    AND is_active = true
  ORDER BY min_weekly_income DESC
  LIMIT 1;

  -- Update agency level and commission if changed
  IF new_level_code IS NOT NULL AND (NEW.level IS NULL OR NEW.level != new_level_code) THEN
    NEW.level := new_level_code;
    NEW.commission_rate := new_commission_rate;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for auto-updating agency level
DROP TRIGGER IF EXISTS trigger_update_agency_level ON public.agencies;
CREATE TRIGGER trigger_update_agency_level
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_agency_level();

-- Create function to recalculate all agency levels (can be called weekly via cron)
CREATE OR REPLACE FUNCTION public.recalculate_all_agency_levels()
RETURNS JSON AS $$
DECLARE
  agency_record RECORD;
  weekly_income NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
  updated_count INTEGER := 0;
BEGIN
  FOR agency_record IN SELECT id FROM public.agencies WHERE is_active = true
  LOOP
    -- Calculate weekly income
    SELECT COALESCE(SUM(total_income), 0) INTO weekly_income
    FROM public.agency_performance
    WHERE agency_id = agency_record.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now());

    -- Get appropriate level
    SELECT level_code, commission_rate 
    INTO new_level_code, new_commission_rate
    FROM public.agency_level_tiers
    WHERE weekly_income >= min_weekly_income 
      AND weekly_income <= max_weekly_income
      AND is_active = true
    ORDER BY min_weekly_income DESC
    LIMIT 1;

    -- Update agency if level changed
    IF new_level_code IS NOT NULL THEN
      UPDATE public.agencies 
      SET level = new_level_code, 
          commission_rate = new_commission_rate,
          updated_at = now()
      WHERE id = agency_record.id 
        AND (level IS DISTINCT FROM new_level_code);
      
      IF FOUND THEN
        updated_count := updated_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'updated_count', updated_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
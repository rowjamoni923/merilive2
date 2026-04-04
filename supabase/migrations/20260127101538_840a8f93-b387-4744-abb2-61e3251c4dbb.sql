-- First drop the problematic trigger
DROP TRIGGER IF EXISTS trigger_update_agency_level ON agencies;

-- Update the function to not override manual admin updates
CREATE OR REPLACE FUNCTION update_agency_level()
RETURNS TRIGGER AS $$
DECLARE
  weekly_income NUMERIC;
  prev_week_income NUMERIC;
  final_income NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
BEGIN
  -- Only auto-update level if the UPDATE is NOT explicitly setting level
  -- (i.e., if level is being set to same value or coming from a performance update)
  IF NEW.level IS NOT NULL AND NEW.level = OLD.level THEN
    -- Level not being changed, check if we should auto-update based on income
    
    -- Get current week income
    SELECT COALESCE(SUM(total_income), 0) INTO weekly_income
    FROM public.agency_performance
    WHERE agency_id = NEW.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now());

    -- Get previous week income
    SELECT COALESCE(SUM(total_income), 0) INTO prev_week_income
    FROM public.agency_performance
    WHERE agency_id = NEW.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now()) - interval '7 days'
      AND period_start < date_trunc('week', now());

    final_income := GREATEST(weekly_income, prev_week_income);

    -- Get appropriate level
    SELECT level_code, commission_rate 
    INTO new_level_code, new_commission_rate
    FROM public.agency_level_tiers
    WHERE final_income >= min_weekly_income 
      AND final_income <= max_weekly_income
      AND is_active = true
    ORDER BY min_weekly_income DESC
    LIMIT 1;

    -- Update if found and different
    IF new_level_code IS NOT NULL AND new_level_code != OLD.level THEN
      NEW.level := new_level_code;
      NEW.commission_rate := new_commission_rate;
    END IF;
  END IF;
  -- If NEW.level != OLD.level, it means someone is explicitly setting the level, so don't override

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate trigger
CREATE TRIGGER trigger_update_agency_level 
  BEFORE UPDATE ON agencies 
  FOR EACH ROW 
  EXECUTE FUNCTION update_agency_level();
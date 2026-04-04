
-- First drop the existing function
DROP FUNCTION IF EXISTS public.recalculate_all_agency_levels();

-- Fix the agency level update function to convert beans to USD before comparing
CREATE OR REPLACE FUNCTION public.update_agency_level_from_performance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  weekly_income_beans NUMERIC;
  prev_week_income_beans NUMERIC;
  final_income_beans NUMERIC;
  final_income_usd NUMERIC;
  beans_to_usd_rate NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
  current_agency RECORD;
BEGIN
  -- Get beans to USD rate from app_settings (default 9000 beans = $1)
  SELECT COALESCE((setting_value->>'rate')::NUMERIC, 9000) INTO beans_to_usd_rate
  FROM app_settings
  WHERE setting_key = 'beans_to_usd_rate';
  
  IF beans_to_usd_rate IS NULL OR beans_to_usd_rate = 0 THEN
    beans_to_usd_rate := 9000;
  END IF;

  -- Get current week income (in beans)
  SELECT COALESCE(SUM(total_income), 0) INTO weekly_income_beans
  FROM public.agency_performance
  WHERE agency_id = NEW.agency_id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now());

  -- Get previous week income (in case current week just started)
  SELECT COALESCE(SUM(total_income), 0) INTO prev_week_income_beans
  FROM public.agency_performance
  WHERE agency_id = NEW.agency_id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now()) - interval '7 days'
    AND period_start < date_trunc('week', now());

  -- Use higher of current or previous week (in beans)
  final_income_beans := GREATEST(weekly_income_beans, prev_week_income_beans);
  
  -- Convert beans to USD for level comparison
  final_income_usd := final_income_beans / beans_to_usd_rate;

  -- Get current agency details
  SELECT level, commission_rate INTO current_agency
  FROM public.agencies
  WHERE id = NEW.agency_id;

  -- Get appropriate level based on USD income
  SELECT level_code, commission_rate 
  INTO new_level_code, new_commission_rate
  FROM public.agency_level_tiers
  WHERE final_income_usd >= min_weekly_income 
    AND final_income_usd <= max_weekly_income
    AND is_active = true
  ORDER BY min_weekly_income DESC
  LIMIT 1;

  -- If income exceeds all tiers, use highest tier (A5 Legend)
  IF new_level_code IS NULL AND final_income_usd > 0 THEN
    SELECT level_code, commission_rate 
    INTO new_level_code, new_commission_rate
    FROM public.agency_level_tiers
    WHERE is_active = true
    ORDER BY max_weekly_income DESC
    LIMIT 1;
  END IF;

  -- Default to A1 if nothing found
  IF new_level_code IS NULL THEN
    SELECT level_code, commission_rate 
    INTO new_level_code, new_commission_rate
    FROM public.agency_level_tiers
    WHERE level_code = 'A1' AND is_active = true
    LIMIT 1;
  END IF;

  -- Update agency level and commission if changed
  IF new_level_code IS NOT NULL AND (current_agency.level IS NULL OR current_agency.level != new_level_code) THEN
    UPDATE public.agencies 
    SET level = new_level_code, commission_rate = new_commission_rate, updated_at = now()
    WHERE id = NEW.agency_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Create function to recalculate all agency levels
CREATE OR REPLACE FUNCTION public.recalculate_all_agency_levels()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agency_record RECORD;
  updated_count INTEGER := 0;
  weekly_income_beans NUMERIC;
  prev_week_income_beans NUMERIC;
  final_income_beans NUMERIC;
  final_income_usd NUMERIC;
  beans_to_usd_rate NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
BEGIN
  -- Get beans to USD rate
  SELECT COALESCE((setting_value->>'rate')::NUMERIC, 9000) INTO beans_to_usd_rate
  FROM app_settings
  WHERE setting_key = 'beans_to_usd_rate';
  
  IF beans_to_usd_rate IS NULL OR beans_to_usd_rate = 0 THEN
    beans_to_usd_rate := 9000;
  END IF;

  FOR agency_record IN SELECT id FROM agencies WHERE is_active = true LOOP
    -- Get current week income
    SELECT COALESCE(SUM(total_income), 0) INTO weekly_income_beans
    FROM agency_performance
    WHERE agency_id = agency_record.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now());

    -- Get previous week income
    SELECT COALESCE(SUM(total_income), 0) INTO prev_week_income_beans
    FROM agency_performance
    WHERE agency_id = agency_record.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now()) - interval '7 days'
      AND period_start < date_trunc('week', now());

    -- Use higher of current or previous week
    final_income_beans := GREATEST(weekly_income_beans, prev_week_income_beans);
    final_income_usd := final_income_beans / beans_to_usd_rate;

    -- Get appropriate level
    SELECT level_code, commission_rate 
    INTO new_level_code, new_commission_rate
    FROM agency_level_tiers
    WHERE final_income_usd >= min_weekly_income 
      AND final_income_usd <= max_weekly_income
      AND is_active = true
    ORDER BY min_weekly_income DESC
    LIMIT 1;

    -- If income exceeds all tiers, use highest tier
    IF new_level_code IS NULL AND final_income_usd > 0 THEN
      SELECT level_code, commission_rate 
      INTO new_level_code, new_commission_rate
      FROM agency_level_tiers
      WHERE is_active = true
      ORDER BY max_weekly_income DESC
      LIMIT 1;
    END IF;

    -- Default to A1
    IF new_level_code IS NULL THEN
      new_level_code := 'A1';
      new_commission_rate := 3;
    END IF;

    -- Update if different
    UPDATE agencies
    SET level = new_level_code, commission_rate = new_commission_rate, updated_at = now()
    WHERE id = agency_record.id
      AND (level IS NULL OR level != new_level_code);
    
    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$;

-- Run the recalculation now to fix existing agencies
SELECT public.recalculate_all_agency_levels();

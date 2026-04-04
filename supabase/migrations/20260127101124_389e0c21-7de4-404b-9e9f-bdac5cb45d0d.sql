-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS update_agency_level_on_performance ON agency_performance;
DROP FUNCTION IF EXISTS update_agency_level_from_performance();

-- Create improved function to auto-update agency level based on performance
CREATE OR REPLACE FUNCTION update_agency_level_from_performance()
RETURNS TRIGGER AS $$
DECLARE
  weekly_income NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
  current_agency RECORD;
BEGIN
  -- Get current weekly income for this agency
  SELECT COALESCE(SUM(total_income), 0) INTO weekly_income
  FROM public.agency_performance
  WHERE agency_id = NEW.agency_id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now());

  -- Get current agency details
  SELECT level, commission_rate INTO current_agency
  FROM public.agencies
  WHERE id = NEW.agency_id;

  -- Get appropriate level based on income from agency_level_tiers
  SELECT level_code, commission_rate 
  INTO new_level_code, new_commission_rate
  FROM public.agency_level_tiers
  WHERE weekly_income >= min_weekly_income 
    AND weekly_income <= max_weekly_income
    AND is_active = true
  ORDER BY min_weekly_income DESC
  LIMIT 1;

  -- Default to A1 if no tier matches
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
    SET 
      level = new_level_code,
      commission_rate = new_commission_rate,
      updated_at = now()
    WHERE id = NEW.agency_id;
    
    RAISE NOTICE 'Agency % level updated from % to % (income: %, commission: %)', 
      NEW.agency_id, current_agency.level, new_level_code, weekly_income, new_commission_rate;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on agency_performance table
CREATE TRIGGER update_agency_level_on_performance
  AFTER INSERT OR UPDATE ON agency_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_agency_level_from_performance();

-- Also create a manual function to recalculate all agency levels now
CREATE OR REPLACE FUNCTION recalculate_all_agency_levels()
RETURNS json AS $$
DECLARE
  _agency RECORD;
  _weekly_income NUMERIC;
  _new_level VARCHAR(10);
  _new_rate NUMERIC;
  _updated_count INT := 0;
BEGIN
  FOR _agency IN SELECT id, level, commission_rate FROM agencies WHERE is_active = true
  LOOP
    -- Get current weekly income
    SELECT COALESCE(SUM(total_income), 0) INTO _weekly_income
    FROM agency_performance
    WHERE agency_id = _agency.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now());

    -- Get appropriate tier
    SELECT level_code, commission_rate 
    INTO _new_level, _new_rate
    FROM agency_level_tiers
    WHERE _weekly_income >= min_weekly_income 
      AND _weekly_income <= max_weekly_income
      AND is_active = true
    ORDER BY min_weekly_income DESC
    LIMIT 1;

    -- Default to A1
    IF _new_level IS NULL THEN
      SELECT level_code, commission_rate INTO _new_level, _new_rate
      FROM agency_level_tiers WHERE level_code = 'A1' AND is_active = true LIMIT 1;
    END IF;

    -- Update if changed
    IF _new_level IS NOT NULL AND (_agency.level IS NULL OR _agency.level != _new_level) THEN
      UPDATE agencies SET level = _new_level, commission_rate = _new_rate, updated_at = now()
      WHERE id = _agency.id;
      _updated_count := _updated_count + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'updated_agencies', _updated_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
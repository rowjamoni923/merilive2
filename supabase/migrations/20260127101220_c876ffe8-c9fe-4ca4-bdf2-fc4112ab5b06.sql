-- Update the function to use last 7 days OR previous week's income (whichever is higher)
CREATE OR REPLACE FUNCTION update_agency_level_from_performance()
RETURNS TRIGGER AS $$
DECLARE
  weekly_income NUMERIC;
  prev_week_income NUMERIC;
  final_income NUMERIC;
  new_level_code VARCHAR(10);
  new_commission_rate NUMERIC;
  current_agency RECORD;
BEGIN
  -- Get current week income
  SELECT COALESCE(SUM(total_income), 0) INTO weekly_income
  FROM public.agency_performance
  WHERE agency_id = NEW.agency_id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now());

  -- Also get previous week income (in case current week just started)
  SELECT COALESCE(SUM(total_income), 0) INTO prev_week_income
  FROM public.agency_performance
  WHERE agency_id = NEW.agency_id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now()) - interval '7 days'
    AND period_start < date_trunc('week', now());

  -- Use higher of current or previous week
  final_income := GREATEST(weekly_income, prev_week_income);

  -- Get current agency details
  SELECT level, commission_rate INTO current_agency
  FROM public.agencies
  WHERE id = NEW.agency_id;

  -- Get appropriate level based on income
  SELECT level_code, commission_rate 
  INTO new_level_code, new_commission_rate
  FROM public.agency_level_tiers
  WHERE final_income >= min_weekly_income 
    AND final_income <= max_weekly_income
    AND is_active = true
  ORDER BY min_weekly_income DESC
  LIMIT 1;

  -- Default to A1
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update recalculate function too
CREATE OR REPLACE FUNCTION recalculate_all_agency_levels()
RETURNS json AS $$
DECLARE
  _agency RECORD;
  _current_income NUMERIC;
  _prev_income NUMERIC;
  _final_income NUMERIC;
  _new_level VARCHAR(10);
  _new_rate NUMERIC;
  _updated_count INT := 0;
BEGIN
  FOR _agency IN SELECT id, level, commission_rate FROM agencies WHERE is_active = true
  LOOP
    -- Current week income
    SELECT COALESCE(SUM(total_income), 0) INTO _current_income
    FROM agency_performance
    WHERE agency_id = _agency.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now());

    -- Previous week income
    SELECT COALESCE(SUM(total_income), 0) INTO _prev_income
    FROM agency_performance
    WHERE agency_id = _agency.id
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now()) - interval '7 days'
      AND period_start < date_trunc('week', now());

    _final_income := GREATEST(_current_income, _prev_income);

    -- Get appropriate tier
    SELECT level_code, commission_rate 
    INTO _new_level, _new_rate
    FROM agency_level_tiers
    WHERE _final_income >= min_weekly_income 
      AND _final_income <= max_weekly_income
      AND is_active = true
    ORDER BY min_weekly_income DESC
    LIMIT 1;

    IF _new_level IS NULL THEN
      SELECT level_code, commission_rate INTO _new_level, _new_rate
      FROM agency_level_tiers WHERE level_code = 'A1' AND is_active = true LIMIT 1;
    END IF;

    IF _new_level IS NOT NULL AND (_agency.level IS NULL OR _agency.level != _new_level) THEN
      UPDATE agencies SET level = _new_level, commission_rate = _new_rate, updated_at = now()
      WHERE id = _agency.id;
      _updated_count := _updated_count + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'updated_agencies', _updated_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
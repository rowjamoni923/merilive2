-- Drop and recreate with correct return type
DROP FUNCTION IF EXISTS recalculate_all_agency_levels();

CREATE OR REPLACE FUNCTION recalculate_all_agency_levels()
RETURNS json AS $$
DECLARE
  _agency RECORD;
  _current_week_income NUMERIC;
  _prev_week_income NUMERIC;
  _final_income NUMERIC;
  _new_level TEXT;
  _new_rate NUMERIC;
  _updated_count INT := 0;
  _is_payroll_helper BOOLEAN;
BEGIN
  FOR _agency IN SELECT id, level, commission_rate, owner_id FROM agencies WHERE is_active = true
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM topup_helpers 
      WHERE user_id = _agency.owner_id 
        AND is_verified = true 
        AND trader_level = 5 
        AND payroll_enabled = true
    ) INTO _is_payroll_helper;

    IF _is_payroll_helper THEN
      IF _agency.level IS NULL OR _agency.level != 'A5' OR _agency.commission_rate != 12 THEN
        UPDATE agencies SET level = 'A5', commission_rate = 12, updated_at = now()
        WHERE id = _agency.id;
        _updated_count := _updated_count + 1;
      END IF;
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(total_income), 0) INTO _current_week_income
    FROM agency_performance 
    WHERE agency_id = _agency.id 
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now());

    SELECT COALESCE(SUM(total_income), 0) INTO _prev_week_income
    FROM agency_performance 
    WHERE agency_id = _agency.id 
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now()) - interval '7 days'
      AND period_start < date_trunc('week', now());

    _final_income := GREATEST(_current_week_income, _prev_week_income);

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


-- Fix trigger function too
CREATE OR REPLACE FUNCTION update_agency_level_from_performance()
RETURNS TRIGGER AS $$
DECLARE
  current_agency RECORD;
  new_level_code TEXT;
  new_commission_rate NUMERIC;
  final_income NUMERIC;
  current_week_income NUMERIC;
  prev_week_income NUMERIC;
  _is_payroll_helper BOOLEAN;
BEGIN
  SELECT id, level, commission_rate, owner_id INTO current_agency
  FROM public.agencies WHERE id = NEW.agency_id;
  
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM topup_helpers 
    WHERE user_id = current_agency.owner_id 
      AND is_verified = true 
      AND trader_level = 5 
      AND payroll_enabled = true
  ) INTO _is_payroll_helper;

  IF _is_payroll_helper THEN
    IF current_agency.level IS NULL OR current_agency.level != 'A5' OR current_agency.commission_rate != 12 THEN
      UPDATE public.agencies 
      SET level = 'A5', commission_rate = 12, updated_at = now()
      WHERE id = NEW.agency_id;
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(total_income), 0) INTO current_week_income
  FROM public.agency_performance
  WHERE agency_id = NEW.agency_id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now());

  SELECT COALESCE(SUM(total_income), 0) INTO prev_week_income
  FROM public.agency_performance
  WHERE agency_id = NEW.agency_id
    AND period_type = 'weekly'
    AND period_start >= date_trunc('week', now()) - interval '7 days'
    AND period_start < date_trunc('week', now());

  final_income := GREATEST(current_week_income, prev_week_income);

  SELECT level_code, commission_rate 
  INTO new_level_code, new_commission_rate
  FROM public.agency_level_tiers
  WHERE final_income >= min_weekly_income 
    AND final_income <= max_weekly_income
    AND is_active = true
  ORDER BY min_weekly_income DESC
  LIMIT 1;

  IF new_level_code IS NULL THEN
    SELECT level_code, commission_rate 
    INTO new_level_code, new_commission_rate
    FROM public.agency_level_tiers
    WHERE level_code = 'A1' AND is_active = true
    LIMIT 1;
  END IF;

  IF new_level_code IS NOT NULL AND (current_agency.level IS NULL OR current_agency.level != new_level_code) THEN
    UPDATE public.agencies 
    SET level = new_level_code, commission_rate = new_commission_rate, updated_at = now()
    WHERE id = NEW.agency_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

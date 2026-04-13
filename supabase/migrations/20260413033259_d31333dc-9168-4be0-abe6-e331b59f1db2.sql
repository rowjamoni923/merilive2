
-- =====================================================
-- FIX: Create missing recalculate_user_level function
-- This was called by update_user_level_comprehensive trigger
-- but the function didn't exist - causing silent failures
-- =====================================================

CREATE OR REPLACE FUNCTION public.recalculate_user_level(_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile record;
  _new_level integer := 0;
  _topup_total bigint;
BEGIN
  SELECT id, coins, total_recharged, total_consumption, user_level, is_host, gender, weekly_earnings, host_level
  INTO _profile
  FROM profiles
  WHERE id = _user_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- HOST LEVEL: Based on weekly_earnings (admin-configured tiers)
  IF _profile.is_host = true AND _profile.gender = 'female' THEN
    SELECT COALESCE(level_number, 0) INTO _new_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_consumption <= COALESCE(_profile.weekly_earnings, 0)
    ORDER BY level_number DESC
    LIMIT 1;

    _new_level := COALESCE(_new_level, 0);

    -- High Water Mark: never go below current host_level display
    IF _new_level > COALESCE(_profile.host_level, 0) THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET host_level = _new_level, updated_at = now() WHERE id = _user_id;
    END IF;

    RETURN; -- Hosts don't use user_level
  END IF;

  -- USER/AGENCY LEVEL: Based on total_recharged (topup only, NOT consumption)
  _topup_total := COALESCE(_profile.total_recharged, 0);

  SELECT COALESCE(level_number, 0) INTO _new_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= _topup_total
  ORDER BY level_number DESC
  LIMIT 1;

  _new_level := COALESCE(_new_level, 0);

  IF _new_level != COALESCE(_profile.user_level, 0) THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles SET user_level = _new_level, updated_at = now() WHERE id = _user_id;
  END IF;
END;
$$;

-- =====================================================
-- FIX: auto_update_level trigger - should NOT change level
-- on consumption. Level only changes via total_recharged.
-- We make it a no-op since update_user_level_comprehensive
-- already handles the correct logic above.
-- =====================================================

CREATE OR REPLACE FUNCTION public.auto_update_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- User level is now ONLY based on total_recharged (handled by recalculate_user_level)
  -- total_consumption changes should NOT affect level
  -- The trigger_auto_update_level_profiles handles this via update_user_level_comprehensive
  RETURN NEW;
END;
$$;

-- =====================================================
-- FIX: auto_recalc_host_level - use weekly_earnings and
-- user_level_tiers table instead of hardcoded thresholds
-- =====================================================

CREATE OR REPLACE FUNCTION public.auto_recalc_host_level()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_level INTEGER := 0;
BEGIN
  -- Only recalculate for hosts when weekly_earnings changes
  IF NEW.is_host = true AND (
    NEW.weekly_earnings IS DISTINCT FROM OLD.weekly_earnings
    OR NEW.total_earnings IS DISTINCT FROM OLD.total_earnings
  ) THEN
    -- Use admin-configured tiers from user_level_tiers table
    SELECT COALESCE(level_number, 0) INTO _new_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_consumption <= COALESCE(NEW.weekly_earnings, 0)
    ORDER BY level_number DESC
    LIMIT 1;

    _new_level := COALESCE(_new_level, 0);

    -- High Water Mark: only go UP, never DOWN during the week
    IF _new_level > COALESCE(NEW.host_level, 0) THEN
      NEW.host_level := _new_level;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

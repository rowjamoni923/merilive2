-- Function: Auto-upgrade helper trader level based on total_level_upgrade_cost
-- Levels 1-4 upgrade automatically, Level 5 requires manual application
CREATE OR REPLACE FUNCTION public.recalculate_helper_trader_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_level integer := 1;
BEGIN
  -- Find the highest level the helper qualifies for (max level 4 for auto-upgrade)
  SELECT COALESCE(MAX(level_number), 1) INTO _new_level
  FROM trader_level_tiers
  WHERE is_active = true
    AND upgrade_cost_usd <= COALESCE(NEW.total_level_upgrade_cost, 0)
    AND level_number <= 4;  -- Level 5 requires manual application
  
  -- Only upgrade, never downgrade (level can only increase)
  IF _new_level > COALESCE(NEW.trader_level, 1) THEN
    NEW.trader_level := _new_level;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_auto_update_helper_level ON topup_helpers;

-- Trigger: Auto-update level BEFORE row update when total_level_upgrade_cost changes
CREATE TRIGGER trg_auto_update_helper_level
  BEFORE UPDATE OF total_level_upgrade_cost ON topup_helpers
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_helper_trader_level();

-- Also handle INSERT case for new helpers
DROP TRIGGER IF EXISTS trg_auto_update_helper_level_insert ON topup_helpers;

CREATE TRIGGER trg_auto_update_helper_level_insert
  BEFORE INSERT ON topup_helpers
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_helper_trader_level();
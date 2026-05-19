-- Pkg50: Instant level upgrades on every gift/call (host + user)
-- Bug: auto_recalc_host_level was reading min_consumption but admin Pricing Hub
-- writes min_earning_amount. Result: host levels stayed stale until manual recalc.
-- Also: user_level had no high-water-mark trigger on consumption increases.

-- 1) Host level: use min_earning_amount (matches admin Pricing Hub).
--    Also bump user_level high-water-mark whenever consumption/recharge increases,
--    so every gift/call/recharge instantly re-levels both sides.
CREATE OR REPLACE FUNCTION public.auto_recalc_host_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _new_host_level integer := 0;
  _new_user_level integer := 0;
  _topup_total bigint;
BEGIN
  -- HOST LEVEL: bump on earnings increase (gifts received, call earnings)
  IF NEW.is_host = true AND (
    NEW.weekly_earnings IS DISTINCT FROM OLD.weekly_earnings
    OR NEW.total_earnings IS DISTINCT FROM OLD.total_earnings
  ) THEN
    SELECT COALESCE(level_number, 0) INTO _new_host_level
    FROM user_level_tiers
    WHERE tier_type = 'host'
      AND is_active = true
      AND min_earning_amount <= COALESCE(NEW.weekly_earnings, 0)
    ORDER BY level_number DESC
    LIMIT 1;

    _new_host_level := COALESCE(_new_host_level, 0);

    -- High Water Mark: only go UP
    IF _new_host_level > COALESCE(NEW.host_level, 0) THEN
      NEW.host_level := _new_host_level;
    END IF;
  END IF;

  -- USER LEVEL: bump on recharge/consumption increase
  IF NEW.total_recharged IS DISTINCT FROM OLD.total_recharged
     OR NEW.total_consumption IS DISTINCT FROM OLD.total_consumption
     OR NEW.coins IS DISTINCT FROM OLD.coins
  THEN
    _topup_total := GREATEST(
      COALESCE(NEW.total_recharged, 0),
      COALESCE(NEW.coins, 0) + COALESCE(NEW.total_consumption, 0)
    );

    SELECT COALESCE(level_number, 0) INTO _new_user_level
    FROM user_level_tiers
    WHERE tier_type = 'user'
      AND is_active = true
      AND min_topup_amount <= _topup_total
    ORDER BY level_number DESC
    LIMIT 1;

    _new_user_level := COALESCE(_new_user_level, 0);

    -- High Water Mark: never decrement
    IF _new_user_level > COALESCE(NEW.user_level, 0) THEN
      NEW.user_level := _new_user_level;
    END IF;
    IF _new_user_level > COALESCE(NEW.max_user_level, 0) THEN
      NEW.max_user_level := _new_user_level;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) recalculate_single_user_level: same column fix (min_earning_amount for host)
CREATE OR REPLACE FUNCTION public.recalculate_single_user_level(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _profile record;
  _new_user_level integer := 0;
  _new_host_level integer := 0;
  _current_user_level integer := 0;
  _max_user_level integer := 0;
  _user_topup_total numeric;
BEGIN
  SELECT * INTO _profile FROM profiles WHERE id = _user_id;
  IF _profile IS NULL THEN RETURN; END IF;

  _current_user_level := COALESCE(_profile.user_level, 0);
  _max_user_level := GREATEST(COALESCE(_profile.max_user_level, 0), _current_user_level);

  _user_topup_total := GREATEST(
    COALESCE(_profile.total_recharged, 0),
    COALESCE(_profile.coins, 0) + COALESCE(_profile.total_consumption, 0)
  );

  SELECT COALESCE(level_number, 0) INTO _new_user_level
  FROM user_level_tiers
  WHERE tier_type = 'user' AND is_active = true AND min_topup_amount <= _user_topup_total
  ORDER BY level_number DESC LIMIT 1;

  _new_user_level := GREATEST(COALESCE(_new_user_level, 0), _current_user_level, _max_user_level);
  _max_user_level := GREATEST(_new_user_level, _max_user_level);

  IF _profile.is_host = true THEN
    SELECT COALESCE(level_number, 0) INTO _new_host_level
    FROM user_level_tiers
    WHERE tier_type = 'host' AND is_active = true AND min_earning_amount <= COALESCE(_profile.weekly_earnings, 0)
    ORDER BY level_number DESC LIMIT 1;
    _new_host_level := GREATEST(COALESCE(_new_host_level, 0), COALESCE(_profile.host_level, 0));
  ELSE
    _new_host_level := COALESCE(_profile.host_level, 0);
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET
    user_level = _new_user_level,
    max_user_level = _max_user_level,
    host_level = _new_host_level,
    previous_host_level = CASE WHEN _new_host_level <> COALESCE(host_level, 0) THEN COALESCE(host_level, 0) ELSE previous_host_level END,
    updated_at = now()
  WHERE id = _user_id;
END;
$function$;

-- 3) Defensive: gift insert AFTER trigger ensures both sender & receiver get
-- re-leveled even if some path bypasses the BEFORE UPDATE trigger.
CREATE OR REPLACE FUNCTION public.update_host_level_on_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.receiver_id IS NOT NULL THEN
    PERFORM public.recalculate_single_user_level(NEW.receiver_id);
  END IF;
  IF NEW.sender_id IS NOT NULL THEN
    PERFORM public.recalculate_single_user_level(NEW.sender_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) Backfill: recalc every profile that has earnings, recharge, or consumption
DO $$
DECLARE
  _r record;
BEGIN
  FOR _r IN
    SELECT id FROM profiles
    WHERE COALESCE(weekly_earnings, 0) > 0
       OR COALESCE(total_earnings, 0) > 0
       OR COALESCE(total_recharged, 0) > 0
       OR COALESCE(total_consumption, 0) > 0
       OR COALESCE(coins, 0) > 0
       OR is_host = true
  LOOP
    PERFORM public.recalculate_single_user_level(_r.id);
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.recalculate_single_user_level(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    _new_host_level := COALESCE(_new_host_level, 0);
  END IF;

  UPDATE profiles SET 
    user_level = _new_user_level,
    max_user_level = _max_user_level,
    host_level = _new_host_level,
    previous_host_level = CASE WHEN _new_host_level != COALESCE(host_level, 0) THEN COALESCE(host_level, 0) ELSE previous_host_level END
  WHERE id = _user_id;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_update_level_profiles ON profiles;
CREATE TRIGGER trigger_auto_update_level_profiles
  AFTER INSERT OR UPDATE OF coins, total_consumption, total_earnings, total_recharged, is_host, weekly_earnings ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_update_level();

CREATE OR REPLACE FUNCTION public.auto_level_on_recharge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.transaction_type IN ('recharge', 'self_recharge', 'admin_recharge', 'helper_recharge') AND NEW.status = 'completed' AND NEW.user_id IS NOT NULL THEN
    PERFORM public.recalculate_single_user_level(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_level_on_coin_recharge ON coin_transactions;
CREATE TRIGGER trigger_level_on_coin_recharge
  AFTER INSERT OR UPDATE ON coin_transactions
  FOR EACH ROW EXECUTE FUNCTION auto_level_on_recharge();
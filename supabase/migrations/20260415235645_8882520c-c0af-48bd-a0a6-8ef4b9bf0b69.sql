
-- Fix recalculate_user_level to use actual transaction totals (not just profiles.total_recharged)
-- This ensures user_level in DB matches the real recharge amount

CREATE OR REPLACE FUNCTION public.recalculate_user_level(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile record;
  _new_level integer := 0;
  _topup_total bigint;
  _coin_tx_total bigint;
  _payment_tx_total bigint;
  _effective_total bigint;
BEGIN
  SELECT id, coins, total_recharged, total_consumption, user_level, max_user_level, is_host, gender, weekly_earnings, host_level
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

    IF _new_level > COALESCE(_profile.host_level, 0) THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET host_level = _new_level, updated_at = now() WHERE id = _user_id;
    END IF;

    RETURN;
  END IF;

  -- USER/AGENCY LEVEL: Sum from ACTUAL transactions, not just profiles.total_recharged
  SELECT COALESCE(SUM(coins_amount), 0) INTO _coin_tx_total
  FROM coin_transactions
  WHERE user_id = _user_id
    AND status = 'completed'
    AND transaction_type IN ('recharge', 'self_recharge');

  SELECT COALESCE(SUM(diamonds_amount), 0) INTO _payment_tx_total
  FROM payment_transactions
  WHERE user_id = _user_id
    AND status = 'completed';

  _effective_total := GREATEST(
    COALESCE(_profile.total_recharged, 0),
    _coin_tx_total,
    _payment_tx_total
  );

  -- Sync total_recharged if transactions show higher amount
  IF _effective_total > COALESCE(_profile.total_recharged, 0) THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles SET total_recharged = _effective_total, updated_at = now() WHERE id = _user_id;
  END IF;

  SELECT COALESCE(level_number, 0) INTO _new_level
  FROM user_level_tiers
  WHERE tier_type = 'user'
    AND is_active = true
    AND min_topup_amount <= _effective_total
  ORDER BY level_number DESC
  LIMIT 1;

  _new_level := COALESCE(_new_level, 1);

  -- Update level and max_user_level (high water mark)
  IF _new_level != COALESCE(_profile.user_level, 0) OR _new_level > COALESCE(_profile.max_user_level, 0) THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles 
    SET user_level = _new_level, 
        max_user_level = GREATEST(COALESCE(max_user_level, 0), _new_level),
        updated_at = now() 
    WHERE id = _user_id;
  END IF;
END;
$$;

-- Also create a trigger to auto-recalculate level when coin_transactions are inserted
CREATE OR REPLACE FUNCTION public.auto_recalculate_level_on_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.transaction_type IN ('recharge', 'self_recharge') THEN
    PERFORM public.recalculate_user_level(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_level_on_coin_tx ON coin_transactions;
CREATE TRIGGER trg_recalculate_level_on_coin_tx
  AFTER INSERT OR UPDATE ON coin_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_recalculate_level_on_transaction();

-- Auto-recalculate on payment_transactions too
CREATE OR REPLACE FUNCTION public.auto_recalculate_level_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    PERFORM public.recalculate_user_level(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_level_on_payment_tx ON payment_transactions;
CREATE TRIGGER trg_recalculate_level_on_payment_tx
  AFTER INSERT OR UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_recalculate_level_on_payment();

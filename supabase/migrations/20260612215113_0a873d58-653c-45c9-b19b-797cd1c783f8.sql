CREATE OR REPLACE FUNCTION public._pkg311_recalculate_user_level_impl(_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _profile record;
  _new_level integer := 0;
  _coin_tx_total bigint;
  _payment_tx_total bigint;
  _effective_total bigint;
BEGIN
  SELECT id, coins, total_recharged, total_consumption, user_level, max_user_level, is_host, gender, weekly_earnings, host_level
  INTO _profile
  FROM profiles
  WHERE id = _user_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF _profile.is_host = true AND _profile.gender = 'female' THEN
    SELECT COALESCE(level_number, 0) INTO _new_level
    FROM user_level_tiers
    WHERE tier_type = 'host' AND is_active = true
      AND min_consumption <= COALESCE(_profile.weekly_earnings, 0)
    ORDER BY level_number DESC LIMIT 1;
    _new_level := COALESCE(_new_level, 0);
    IF _new_level <> COALESCE(_profile.host_level, 0) THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET host_level = _new_level, updated_at = now() WHERE id = _user_id;
    END IF;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(coins_amount), 0) INTO _coin_tx_total
  FROM coin_transactions
  WHERE user_id = _user_id AND status = 'completed'
    AND transaction_type IN ('recharge', 'self_recharge');

  SELECT COALESCE(SUM(diamonds_amount), 0) INTO _payment_tx_total
  FROM payment_transactions
  WHERE user_id = _user_id AND status = 'completed';

  _effective_total := GREATEST(
    COALESCE(_profile.total_recharged, 0), _coin_tx_total, _payment_tx_total
  );

  IF _effective_total > COALESCE(_profile.total_recharged, 0) THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles SET total_recharged = _effective_total, updated_at = now() WHERE id = _user_id;
  END IF;

  SELECT COALESCE(level_number, 0) INTO _new_level
  FROM user_level_tiers
  WHERE tier_type = 'user' AND is_active = true
    AND min_topup_amount <= _effective_total
  ORDER BY level_number DESC LIMIT 1;

  _new_level := COALESCE(_new_level, 0);

  IF _new_level != COALESCE(_profile.user_level, 0) OR _new_level > COALESCE(_profile.max_user_level, 0) THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles 
    SET user_level = _new_level, 
        max_user_level = GREATEST(COALESCE(max_user_level, 0), _new_level),
        updated_at = now() 
    WHERE id = _user_id;
  END IF;
END;
$function$;

ALTER TABLE public.profiles ALTER COLUMN host_level SET DEFAULT 0;

DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  WITH topups AS (
    SELECT p.id,
           GREATEST(
             COALESCE(p.total_recharged, 0),
             COALESCE((SELECT SUM(coins_amount) FROM coin_transactions
                        WHERE user_id = p.id AND status='completed'
                          AND transaction_type IN ('recharge','self_recharge')), 0),
             COALESCE((SELECT SUM(diamonds_amount) FROM payment_transactions
                        WHERE user_id = p.id AND status='completed'), 0)
           ) AS effective_total
    FROM profiles p
    WHERE p.is_host IS NOT TRUE OR p.gender IS DISTINCT FROM 'female'
  )
  UPDATE profiles p
  SET user_level = COALESCE((
        SELECT level_number FROM user_level_tiers
         WHERE tier_type='user' AND is_active=true
           AND min_topup_amount <= t.effective_total
         ORDER BY level_number DESC LIMIT 1
      ), 0),
      max_user_level = COALESCE((
        SELECT level_number FROM user_level_tiers
         WHERE tier_type='user' AND is_active=true
           AND min_topup_amount <= t.effective_total
         ORDER BY level_number DESC LIMIT 1
      ), 0),
      updated_at = now()
  FROM topups t
  WHERE p.id = t.id;

  UPDATE profiles p
  SET host_level = COALESCE((
        SELECT level_number FROM user_level_tiers
         WHERE tier_type='host' AND is_active=true
           AND min_consumption <= COALESCE(p.weekly_earnings, 0)
         ORDER BY level_number DESC LIMIT 1
      ), 0),
      updated_at = now()
  WHERE p.is_host = true AND p.gender = 'female';
END $$;
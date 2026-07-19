-- Merge legacy Coin app setting keys into Diamond keys, then remove the old keys.
INSERT INTO public.app_settings (setting_key, setting_value, description, updated_at)
SELECT 'agency_diamond_exchange', setting_value, description, now()
FROM public.app_settings WHERE setting_key = 'agency_coin_exchange'
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description = COALESCE(EXCLUDED.description, public.app_settings.description),
  updated_at = now();

INSERT INTO public.app_settings (setting_key, setting_value, description, updated_at)
SELECT 'diamond_exchange', setting_value, description, now()
FROM public.app_settings WHERE setting_key = 'coin_exchange'
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description = COALESCE(EXCLUDED.description, public.app_settings.description),
  updated_at = now();

INSERT INTO public.app_settings (setting_key, setting_value, description, updated_at)
SELECT 'diamond_packages', replace(setting_value, '"coins"', '"diamonds"'), description, now()
FROM public.app_settings WHERE setting_key = 'coin_packages'
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description = COALESCE(EXCLUDED.description, public.app_settings.description),
  updated_at = now();

INSERT INTO public.app_settings (setting_key, setting_value, description, updated_at)
SELECT 'diamond_trader_settings', setting_value, description, now()
FROM public.app_settings WHERE setting_key = 'coin_trader_settings'
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = EXCLUDED.setting_value,
  description = COALESCE(EXCLUDED.description, public.app_settings.description),
  updated_at = now();

INSERT INTO public.app_settings (setting_key, setting_value, description, updated_at)
SELECT 'welcome_bonus_diamonds', setting_value, description, now()
FROM public.app_settings WHERE setting_key = 'welcome_bonus_coins'
ON CONFLICT (setting_key) DO UPDATE SET
  setting_value = CASE
    WHEN COALESCE(NULLIF(public.app_settings.setting_value, ''), '0')::numeric = 0 THEN EXCLUDED.setting_value
    ELSE public.app_settings.setting_value
  END,
  description = COALESCE(EXCLUDED.description, public.app_settings.description),
  updated_at = now();

DELETE FROM public.app_settings
WHERE setting_key IN ('agency_coin_exchange','coin_exchange','coin_packages','coin_trader_settings','welcome_bonus_coins');

UPDATE public.app_settings
SET setting_value = replace(setting_value, '"coins"', '"diamonds"'),
    updated_at = now()
WHERE setting_value ILIKE '%"coins"%';

-- Remove legacy Coin response-key wording in payment/top-up functions without changing signatures.
DO $$
DECLARE
  r record;
  v_newdef text;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.oid::regprocedure::text IN (
        'admin_complete_payment_transaction(uuid)',
        'admin_recover_purchase_credit(uuid,integer,text,text,text,uuid)',
        'get_google_play_product_info(text)',
        'process_google_play_purchase(uuid,text,text,text,jsonb)',
        'process_helper_order_secure(uuid,text,text)'
      )
  LOOP
    v_newdef := r.def;
    v_newdef := replace(v_newdef, '''creditedCoins''', '''creditedDiamonds''');
    v_newdef := replace(v_newdef, '''baseCoins''', '''baseDiamonds''');
    v_newdef := replace(v_newdef, '''bonusCoins''', '''bonusDiamonds''');
    v_newdef := replace(v_newdef, '''packageBonusCoins''', '''packageBonusDiamonds''');
    v_newdef := replace(v_newdef, '''firstRechargeBonusCoins''', '''firstRechargeBonusDiamonds''');
    v_newdef := replace(v_newdef, '''coinAmount''', '''diamondAmount''');
    v_newdef := replace(v_newdef, 'coinAmount', 'diamondAmount');
    EXECUTE v_newdef;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.claim_daily_login_reward(_claimed_date date DEFAULT NULL::date, _day_start timestamp with time zone DEFAULT NULL::timestamp with time zone, _day_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _is_host boolean;
  _server_date date;
  _yesterday date;
  _existing_claim record;
  _last_claim record;
  _next_day int;
  _reward record;
  _diamonds_to_add int;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT COALESCE(is_host, false) INTO _is_host
  FROM public.profiles WHERE id = _user_id;
  IF COALESCE(_is_host, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hosts are not eligible for daily rewards');
  END IF;

  _server_date := public.get_task_reset_date();
  _yesterday := _server_date - INTERVAL '1 day';

  SELECT * INTO _existing_claim
  FROM public.daily_login_claims
  WHERE user_id = _user_id AND claimed_date = _server_date
  ORDER BY claimed_at DESC
  LIMIT 1;

  IF _existing_claim IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today');
  END IF;

  SELECT * INTO _last_claim
  FROM public.daily_login_claims
  WHERE user_id = _user_id
  ORDER BY claimed_at DESC
  LIMIT 1;

  IF _last_claim IS NOT NULL AND _last_claim.claimed_date = _yesterday THEN
    _next_day := (COALESCE(_last_claim.day_number, 0) % 7) + 1;
  ELSE
    _next_day := 1;
  END IF;

  SELECT * INTO _reward
  FROM public.daily_login_rewards_config
  WHERE day_number = _next_day AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward config not found');
  END IF;

  _diamonds_to_add := COALESCE(_reward.reward_diamonds, 0);
  IF _diamonds_to_add = 0 AND COALESCE(_reward.reward_amount, 0) > 0 THEN
    _diamonds_to_add := _reward.reward_amount;
  END IF;

  BEGIN
    INSERT INTO public.daily_login_claims (user_id, reward_id, day_number, reward_type, reward_amount, claimed_date)
    VALUES (_user_id, _reward.id, _next_day, 'diamonds', _diamonds_to_add, _server_date);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed today');
  END;

  IF _diamonds_to_add > 0 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
    SET diamonds = COALESCE(diamonds, 0) + _diamonds_to_add
    WHERE id = _user_id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);
  END IF;

  INSERT INTO public.user_login_streaks (user_id, current_streak, last_login_date, total_logins)
  VALUES (_user_id, _next_day, _server_date, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET current_streak = _next_day,
      last_login_date = _server_date,
      total_logins = COALESCE(public.user_login_streaks.total_logins, 0) + 1;

  RETURN jsonb_build_object(
    'success', true,
    'day', _next_day,
    'reward_type', 'diamonds',
    'reward_amount', _diamonds_to_add,
    'diamonds', _diamonds_to_add,
    'bonus_label', _reward.bonus_label
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bonus_diamonds integer := 0;
  _final_msg text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.welcome_bonuses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(setting_value, '')::integer, 0)
  INTO _bonus_diamonds
  FROM public.app_settings
  WHERE setting_key = 'welcome_bonus_diamonds';

  _bonus_diamonds := COALESCE(_bonus_diamonds, 0);
  IF _bonus_diamonds <= 0 THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET diamonds = COALESCE(diamonds, 0) + _bonus_diamonds
  WHERE id = NEW.id;

  INSERT INTO public.welcome_bonuses (user_id, bonus_type, bonus_amount, claimed, claimed_at)
  VALUES (NEW.id, 'welcome_bonus', _bonus_diamonds, true, now());

  _final_msg := 'Welcome! You have received ' || _bonus_diamonds::text || ' diamonds as a signup bonus.';

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.id,
    'welcome_bonus',
    '🎁 Welcome Bonus!',
    _final_msg,
    jsonb_build_object('bonus_diamonds', _bonus_diamonds, 'type', 'welcome_bonus')
  );

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RAISE;
END;
$function$;
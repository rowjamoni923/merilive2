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
      AND pg_get_functiondef(p.oid) ILIKE '%coin%'
  LOOP
    v_newdef := r.def;

    -- Avoid known variable collisions before suffix cleanup.
    v_newdef := replace(v_newdef, '_caller_coins', '_caller_spend_balance');
    v_newdef := replace(v_newdef, '_sender_coins', '_sender_spend_balance');
    v_newdef := replace(v_newdef, '_receiver_coins', '_receiver_spend_balance');
    v_newdef := replace(v_newdef, '_user_coins', '_user_spend_balance');
    v_newdef := replace(v_newdef, '_current_coins', '_current_spend_balance');
    v_newdef := replace(v_newdef, '_remaining_coins', '_remaining_spend_balance');
    v_newdef := replace(v_newdef, '_available_coins', '_available_spend_balance');
    v_newdef := replace(v_newdef, '_required_coins', '_required_spend_balance');
    v_newdef := replace(v_newdef, '_profile_coins', '_profile_spend_balance');
    v_newdef := replace(v_newdef, 'v_base_coins', 'v_base_diamonds');
    v_newdef := replace(v_newdef, 'v_credit_coins', 'v_credit_diamonds');

    v_newdef := replace(v_newdef, 'coins_', 'diamonds_');
    v_newdef := replace(v_newdef, 'Coins_', 'Diamonds_');
    v_newdef := replace(v_newdef, 'COINS_', 'DIAMONDS_');
    v_newdef := replace(v_newdef, '_coins', '_diamonds');
    v_newdef := replace(v_newdef, '_Coins', '_Diamonds');
    v_newdef := replace(v_newdef, '_COINS', '_DIAMONDS');
    v_newdef := replace(v_newdef, 'coin_', 'diamond_');
    v_newdef := replace(v_newdef, 'Coin_', 'Diamond_');
    v_newdef := replace(v_newdef, 'COIN_', 'DIAMOND_');
    v_newdef := replace(v_newdef, '_coin', '_diamond');
    v_newdef := replace(v_newdef, '_Coin', '_Diamond');
    v_newdef := replace(v_newdef, '_COIN', '_DIAMOND');

    v_newdef := regexp_replace(v_newdef, '\mcoins\M', 'diamonds', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCoins\M', 'Diamonds', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOINS\M', 'DIAMONDS', 'g');
    v_newdef := regexp_replace(v_newdef, '\mcoin\M', 'diamond', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCoin\M', 'Diamond', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOIN\M', 'DIAMOND', 'g');

    IF v_newdef IS DISTINCT FROM r.def THEN
      BEGIN
        EXECUTE v_newdef;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Skipped legacy wording rewrite for %: %', r.signature, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_recharge_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric;
BEGIN
  v_amount := COALESCE(NEW.diamonds_received, NEW.diamonds_amount, NEW.amount, 0);

  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (NEW.user_id, 'recharge_completed', '💰 Recharge Successful!',
      'Your recharge of ' || v_amount::text || ' diamonds is complete.',
      jsonb_build_object('amount', v_amount, 'transaction_id', NEW.id));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (NEW.user_id, 'recharge_completed', '💰 Recharge Successful!',
      'Your recharge of ' || v_amount::text || ' diamonds is complete.',
      jsonb_build_object('amount', v_amount, 'transaction_id', NEW.id));
    RETURN NEW;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$function$;
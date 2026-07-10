CREATE OR REPLACE FUNCTION public.trigger_apply_recharge_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _coins integer := 0;
BEGIN
  IF COALESCE(NEW.status, '') <> 'completed' THEN
    RETURN NEW;
  END IF;

  _coins := COALESCE(NEW.coins_received, NEW.coins_amount, 0);
  IF _coins <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vip_recharge_bonus_log
    WHERE recharge_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT public.apply_vip_recharge_bonus(NEW.user_id, NEW.id, _coins)
    INTO _result;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[recharge_bonus_trigger] failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;
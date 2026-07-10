CREATE OR REPLACE FUNCTION public.update_consumption_on_recharge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _coins numeric := 0;
BEGIN
  _coins := COALESCE(NEW.coins_received, NEW.coins_amount, NEW.amount, 0);

  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
    SET total_consumption = COALESCE(total_consumption, 0) + _coins
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
    SET total_consumption = COALESCE(total_consumption, 0) + _coins
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
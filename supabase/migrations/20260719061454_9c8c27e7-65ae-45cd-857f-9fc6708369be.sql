BEGIN;

SET LOCAL app.bypass_profile_protection = 'true';

UPDATE public.profiles
SET diamonds = GREATEST(COALESCE(coins, 0), COALESCE(diamonds, 0)),
    coins    = GREATEST(COALESCE(coins, 0), COALESCE(diamonds, 0)),
    updated_at = now()
WHERE COALESCE(coins, 0) IS DISTINCT FROM COALESCE(diamonds, 0)
   OR coins IS NULL
   OR diamonds IS NULL;

CREATE OR REPLACE FUNCTION public.du2_sync_spend_wallet_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.diamonds := GREATEST(COALESCE(NEW.coins, 0), COALESCE(NEW.diamonds, 0));
    NEW.coins := NEW.diamonds;
    RETURN NEW;
  END IF;

  IF NEW.coins IS DISTINCT FROM OLD.coins
     AND NEW.diamonds IS DISTINCT FROM OLD.diamonds
     AND COALESCE(NEW.coins, 0) IS DISTINCT FROM COALESCE(NEW.diamonds, 0) THEN
    NEW.diamonds := GREATEST(COALESCE(NEW.coins, 0), COALESCE(NEW.diamonds, 0));
    NEW.coins := NEW.diamonds;
  ELSIF NEW.coins IS DISTINCT FROM OLD.coins THEN
    NEW.diamonds := COALESCE(NEW.coins, 0);
    NEW.coins := NEW.diamonds;
  ELSIF NEW.diamonds IS DISTINCT FROM OLD.diamonds THEN
    NEW.coins := COALESCE(NEW.diamonds, 0);
    NEW.diamonds := NEW.coins;
  ELSE
    IF COALESCE(NEW.coins, 0) IS DISTINCT FROM COALESCE(NEW.diamonds, 0) THEN
      NEW.diamonds := GREATEST(COALESCE(NEW.coins, 0), COALESCE(NEW.diamonds, 0));
      NEW.coins := NEW.diamonds;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_du2_sync_spend_wallet ON public.profiles;
CREATE TRIGGER trg_du2_sync_spend_wallet
  BEFORE INSERT OR UPDATE OF coins, diamonds
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.du2_sync_spend_wallet_columns();

COMMIT;
-- 1) Make the negative-balance trigger smarter:
--    Only block when the CHANGE itself decreases a balance below zero.
--    If the value is already negative (corrupted) and the new update does
--    not make it worse (or restores it), allow the update. This prevents
--    an entire profile from being un-updatable (which was breaking
--    last_seen_at writes, session validation, and the Profile page).
CREATE OR REPLACE FUNCTION public.prevent_negative_profile_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.coins    < 0 THEN NEW.coins    := 0; END IF;
    IF NEW.diamonds < 0 THEN NEW.diamonds := 0; END IF;
    IF NEW.beans    < 0 THEN NEW.beans    := 0; END IF;
    IF NEW.beans_balance IS NOT NULL AND NEW.beans_balance < 0 THEN
      NEW.beans_balance := 0;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: only block when the update is actively decreasing a balance
  -- to a more-negative value than before. A no-op or restoring update is fine.
  IF NEW.coins < 0 AND NEW.coins < COALESCE(OLD.coins, 0) THEN
    RAISE EXCEPTION 'Profile coins cannot be negative (was %, attempted %)', OLD.coins, NEW.coins;
  END IF;
  IF NEW.diamonds < 0 AND NEW.diamonds < COALESCE(OLD.diamonds, 0) THEN
    RAISE EXCEPTION 'Profile diamonds cannot be negative (was %, attempted %)', OLD.diamonds, NEW.diamonds;
  END IF;
  IF NEW.beans < 0 AND NEW.beans < COALESCE(OLD.beans, 0) THEN
    RAISE EXCEPTION 'Profile beans cannot be negative (was %, attempted %)', OLD.beans, NEW.beans;
  END IF;
  IF NEW.beans_balance IS NOT NULL
     AND NEW.beans_balance < 0
     AND NEW.beans_balance < COALESCE(OLD.beans_balance, 0) THEN
    RAISE EXCEPTION 'Profile beans_balance cannot be negative';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Heal any already-corrupted rows so the app stops hitting the trigger.
--    Bypass the protection trigger so this admin-style fix can run.
SET LOCAL app.bypass_profile_protection = 'true';

UPDATE public.profiles
SET coins = 0
WHERE coins < 0;

UPDATE public.profiles
SET diamonds = 0
WHERE diamonds < 0;

UPDATE public.profiles
SET beans = 0
WHERE beans < 0;

UPDATE public.profiles
SET beans_balance = 0
WHERE beans_balance IS NOT NULL AND beans_balance < 0;
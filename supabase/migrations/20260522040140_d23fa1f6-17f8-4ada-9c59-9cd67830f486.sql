CREATE OR REPLACE FUNCTION public.tg_app_sync_profiles_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := true;
  ELSE
    v_changed :=
      COALESCE(NEW.coins, 0) IS DISTINCT FROM COALESCE(OLD.coins, 0)
      OR COALESCE(NEW.beans, 0) IS DISTINCT FROM COALESCE(OLD.beans, 0)
      OR COALESCE((NEW.diamonds)::bigint, 0) IS DISTINCT FROM COALESCE((OLD.diamonds)::bigint, 0);
  END IF;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  PERFORM public.emit_app_sync_notification(
    NEW.id,
    'profiles',
    TG_OP,
    NEW.id::text,
    jsonb_build_object(
      'profile_id', NEW.id,
      'coins', COALESCE(NEW.coins, 0),
      'diamonds', COALESCE((NEW.diamonds)::bigint, COALESCE(NEW.coins, 0)),
      'beans', COALESCE(NEW.beans, 0)
    )
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_app_sync_profiles_balance ON public.profiles;
CREATE TRIGGER tg_app_sync_profiles_balance
AFTER INSERT OR UPDATE OF coins, diamonds, beans ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_profiles_balance();
CREATE OR REPLACE FUNCTION public.handle_reel_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.reel_id IS NOT NULL THEN
    PERFORM set_config('app.reel_counter_update', '1', true);
    UPDATE public.reels
       SET beans_earned = COALESCE(beans_earned, 0) + COALESCE(NEW.receiver_beans, 0)
     WHERE id = NEW.reel_id;
    PERFORM set_config('app.reel_counter_update', '0', true);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_sender_level_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ BEGIN
  UPDATE profiles 
  SET total_consumption = COALESCE(total_consumption, 0) + NEW.coin_amount,
      updated_at = now() 
  WHERE id = NEW.sender_id;
  RETURN NEW;
END; $$;
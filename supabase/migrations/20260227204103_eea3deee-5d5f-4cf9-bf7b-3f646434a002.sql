
CREATE OR REPLACE FUNCTION public.set_ticket_sender_sector()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.topup_helpers WHERE user_id = NEW.user_id) THEN
    NEW.sender_sector := 'helper';
  ELSIF EXISTS (SELECT 1 FROM public.agencies WHERE owner_id = NEW.user_id) THEN
    NEW.sender_sector := 'agency';
  ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND is_host = true) THEN
    NEW.sender_sector := 'host';
  ELSE
    NEW.sender_sector := 'user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_ticket_sender_sector ON public.support_tickets;
CREATE TRIGGER trigger_set_ticket_sender_sector
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ticket_sender_sector();

CREATE OR REPLACE FUNCTION public.normalize_support_message_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sender_type = 'admin' THEN
    NEW.sender_id := NULL;
  ELSIF NEW.sender_type = 'user' AND NEW.sender_id IS NULL THEN
    RAISE EXCEPTION 'support_user_sender_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_support_message_sender ON public.support_messages;
CREATE TRIGGER trg_normalize_support_message_sender
BEFORE INSERT OR UPDATE ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.normalize_support_message_sender();

UPDATE public.support_messages
SET sender_id = NULL
WHERE sender_type = 'admin'
  AND sender_id IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'tg_admin_broadcast_helper_admin_messages'
  ) THEN
    CREATE TRIGGER tg_admin_broadcast_helper_admin_messages
    AFTER INSERT OR UPDATE OR DELETE ON public.helper_admin_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_admin_broadcast_bump('helper_admin_messages');
  END IF;
END $$;
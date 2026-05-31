-- Add admin_broadcast trigger to notifications table so admin Bell receives real-time pushes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'tg_admin_broadcast_notifications'
      AND tgrelid = 'public.notifications'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER tg_admin_broadcast_notifications
             AFTER INSERT OR UPDATE OR DELETE ON public.notifications
             FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump()';
  END IF;
END $$;
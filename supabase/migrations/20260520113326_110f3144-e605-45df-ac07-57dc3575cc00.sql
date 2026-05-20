DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_admin_broadcast_user_role_frames') THEN
    CREATE TRIGGER tg_admin_broadcast_user_role_frames
    AFTER INSERT OR UPDATE OR DELETE ON public.user_role_frames
    FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('user_role_frames');
  END IF;
END $$;
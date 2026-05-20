DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_moderation_logs','support_tickets','support_messages','support_reports'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tg_admin_broadcast_' || t) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump(%L)',
        'tg_admin_broadcast_' || t, t, t
      );
    END IF;
  END LOOP;
END $$;
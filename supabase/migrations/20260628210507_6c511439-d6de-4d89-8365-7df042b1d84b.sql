
DO $$
DECLARE
  t text;
  report_tables text[] := ARRAY[
    'user_reports',
    'reel_reports',
    'support_tickets',
    'support_messages',
    'support_reports',
    'host_contact_violations',
    'live_face_violations',
    'chat_moderation_logs',
    'host_conversion_requests'
  ];
  trig_name text;
BEGIN
  FOREACH t IN ARRAY report_tables LOOP
    -- Skip tables that don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      CONTINUE;
    END IF;
    trig_name := 't_admin_broadcast_bump_' || t;
    -- Drop any existing trigger with the same name to make this idempotent.
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trig_name, t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump(%L)',
      trig_name, t, t
    );
  END LOOP;
END $$;

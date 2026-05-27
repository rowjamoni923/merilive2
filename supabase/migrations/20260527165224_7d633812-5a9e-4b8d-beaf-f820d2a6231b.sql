-- Pkg378: instant admin-broadcast on remaining admin-config tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['live_categories','pk_competition_rewards','welcome_bonuses'] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname=t AND c.relkind='r') THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS tg_admin_broadcast_%I ON public.%I; '
        'CREATE TRIGGER tg_admin_broadcast_%I '
        'AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump();',
        t, t, t, t
      );
    END IF;
  END LOOP;
END $$;
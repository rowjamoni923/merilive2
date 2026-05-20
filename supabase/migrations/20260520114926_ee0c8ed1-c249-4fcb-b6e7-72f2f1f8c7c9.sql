-- Pkg61: Admin cross-session sync — add broadcast triggers for 8 admin-managed tables
-- that currently push admin saves but lack server-side broadcast.

-- Helper: seed broadcast topic + trigger pattern matches Pkg37/Pkg52/Pkg58.
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'admin_notifications',
    'banned_devices',
    'admin_section_permissions',
    'admin_sections',
    'admin_users',
    'admin_allowed_devices',
    'host_contact_violations',
    'rating_reward_claims'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Seed topic row (idempotent)
    EXECUTE format(
      'INSERT INTO public.admin_broadcast (topic, version, updated_at) VALUES (%L, 0, now()) ON CONFLICT (topic) DO NOTHING',
      tbl
    );
    -- Drop & recreate trigger (idempotent)
    EXECUTE format('DROP TRIGGER IF EXISTS tg_admin_broadcast_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER tg_admin_broadcast_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump(%L)',
      tbl, tbl, tbl
    );
  END LOOP;
END $$;
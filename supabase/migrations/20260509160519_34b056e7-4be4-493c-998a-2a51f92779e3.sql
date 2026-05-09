-- Fix schema drift for Rewards Management cashback tiers and restore admin-session access consistently.

ALTER TABLE public.consumption_return_config
  ADD COLUMN IF NOT EXISTS tier_name text,
  ADD COLUMN IF NOT EXISTS min_spend integer,
  ADD COLUMN IF NOT EXISTS max_spend integer,
  ADD COLUMN IF NOT EXISTS max_return_coins integer,
  ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

UPDATE public.consumption_return_config
SET
  tier_name = COALESCE(tier_name, 'Tier ' || row_number::text),
  min_spend = COALESCE(min_spend, min_consumption, 0),
  max_spend = COALESCE(max_spend, max_consumption),
  period_type = COALESCE(period_type, 'weekly'),
  display_order = COALESCE(display_order, row_number)
FROM (
  SELECT id, row_number() OVER (ORDER BY min_consumption NULLS LAST, created_at NULLS LAST, id) AS row_number
  FROM public.consumption_return_config
) ranked
WHERE public.consumption_return_config.id = ranked.id;

ALTER TABLE public.consumption_return_config
  ALTER COLUMN tier_name SET DEFAULT 'New Tier',
  ALTER COLUMN tier_name SET NOT NULL,
  ALTER COLUMN min_spend SET DEFAULT 0,
  ALTER COLUMN min_spend SET NOT NULL,
  ALTER COLUMN period_type SET DEFAULT 'weekly',
  ALTER COLUMN period_type SET NOT NULL,
  ALTER COLUMN display_order SET DEFAULT 0,
  ALTER COLUMN display_order SET NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_consumption_return_config_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.min_spend := COALESCE(NEW.min_spend, NEW.min_consumption, 0);
  NEW.min_consumption := COALESCE(NEW.min_consumption, NEW.min_spend, 0);
  NEW.max_spend := COALESCE(NEW.max_spend, NEW.max_consumption);
  NEW.max_consumption := COALESCE(NEW.max_consumption, NEW.max_spend);
  NEW.tier_name := COALESCE(NULLIF(NEW.tier_name, ''), 'New Tier');
  NEW.period_type := COALESCE(NULLIF(NEW.period_type, ''), 'weekly');
  NEW.display_order := COALESCE(NEW.display_order, 0);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_consumption_return_config_fields ON public.consumption_return_config;
CREATE TRIGGER trg_sync_consumption_return_config_fields
BEFORE INSERT OR UPDATE ON public.consumption_return_config
FOR EACH ROW
EXECUTE FUNCTION public.sync_consumption_return_config_fields();

DO $$
DECLARE
  r record;
  policy_name text := 'Admin session full access';
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS relname, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = c.relname
          AND p.policyname = policy_name
      )
  LOOP
    EXECUTE format('CREATE POLICY %I ON %s FOR ALL TO anon, authenticated USING (public.is_active_admin_session()) WITH CHECK (public.is_active_admin_session())', policy_name, r.relname);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
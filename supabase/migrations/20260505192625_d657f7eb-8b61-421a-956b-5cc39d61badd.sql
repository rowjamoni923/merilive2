ALTER TABLE public.app_version_settings
  ADD COLUMN IF NOT EXISTS current_version_code integer,
  ADD COLUMN IF NOT EXISTS current_version_name text,
  ADD COLUMN IF NOT EXISTS min_version_code integer,
  ADD COLUMN IF NOT EXISTS update_message text,
  ADD COLUMN IF NOT EXISTS play_store_url text;

UPDATE public.app_version_settings
SET
  current_version_name = COALESCE(current_version_name, current_version),
  current_version_code = COALESCE(
    current_version_code,
    NULLIF(regexp_replace(COALESCE(current_version, '0'), '[^0-9]', '', 'g'), '')::integer,
    0
  ),
  min_version_code = COALESCE(
    min_version_code,
    NULLIF(regexp_replace(COALESCE(minimum_version, current_version, '0'), '[^0-9]', '', 'g'), '')::integer,
    0
  ),
  update_message = COALESCE(update_message, changelog, ''),
  play_store_url = COALESCE(play_store_url, update_url, '')
WHERE current_version_name IS NULL
   OR current_version_code IS NULL
   OR min_version_code IS NULL
   OR update_message IS NULL
   OR play_store_url IS NULL;

ALTER TABLE public.app_version_settings
  ALTER COLUMN current_version_code SET DEFAULT 0,
  ALTER COLUMN current_version_name SET DEFAULT '1.0.0',
  ALTER COLUMN min_version_code SET DEFAULT 0,
  ALTER COLUMN update_message SET DEFAULT '',
  ALTER COLUMN play_store_url SET DEFAULT '';

CREATE OR REPLACE FUNCTION public.sync_app_version_legacy_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.current_version_name := COALESCE(NEW.current_version_name, NEW.current_version, '1.0.0');
  NEW.current_version := COALESCE(NEW.current_version, NEW.current_version_name, '1.0.0');
  NEW.current_version_code := COALESCE(
    NEW.current_version_code,
    NULLIF(regexp_replace(COALESCE(NEW.current_version_name, NEW.current_version, '0'), '[^0-9]', '', 'g'), '')::integer,
    0
  );

  NEW.min_version_code := COALESCE(
    NEW.min_version_code,
    NULLIF(regexp_replace(COALESCE(NEW.minimum_version, NEW.current_version, '0'), '[^0-9]', '', 'g'), '')::integer,
    0
  );
  NEW.minimum_version := COALESCE(NEW.minimum_version, NEW.current_version_name, NEW.current_version, '1.0.0');

  NEW.update_message := COALESCE(NEW.update_message, NEW.changelog, '');
  NEW.changelog := COALESCE(NEW.changelog, NEW.update_message, '');
  NEW.play_store_url := COALESCE(NEW.play_store_url, NEW.update_url, '');
  NEW.update_url := COALESCE(NEW.update_url, NEW.play_store_url, '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_app_version_legacy_fields_trigger ON public.app_version_settings;
CREATE TRIGGER sync_app_version_legacy_fields_trigger
BEFORE INSERT OR UPDATE ON public.app_version_settings
FOR EACH ROW
EXECUTE FUNCTION public.sync_app_version_legacy_fields();
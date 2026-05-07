ALTER TABLE public.app_content ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
UPDATE public.app_content SET is_active = COALESCE(is_published, true) WHERE is_active IS NULL;
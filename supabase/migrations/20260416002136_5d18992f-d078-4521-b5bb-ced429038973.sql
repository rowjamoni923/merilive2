ALTER TABLE public.helper_level_config
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
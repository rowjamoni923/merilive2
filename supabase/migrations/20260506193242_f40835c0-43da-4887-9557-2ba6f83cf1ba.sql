ALTER TABLE public.landing_page_sections
  ADD COLUMN IF NOT EXISTS section_type text NOT NULL DEFAULT 'feature';

UPDATE public.landing_page_sections SET section_type = 'feature' WHERE section_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_landing_page_sections_type ON public.landing_page_sections(section_type);
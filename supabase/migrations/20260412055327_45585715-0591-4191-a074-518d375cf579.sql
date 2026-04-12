-- First add updated_at so the trigger doesn't fail
ALTER TABLE public.allowed_external_links 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Now add the missing columns
ALTER TABLE public.allowed_external_links 
ADD COLUMN IF NOT EXISTS url_pattern text,
ADD COLUMN IF NOT EXISTS link_type text DEFAULT 'domain',
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';

-- Migrate existing 'url' data into 'url_pattern'
UPDATE public.allowed_external_links 
SET url_pattern = url 
WHERE url_pattern IS NULL AND url IS NOT NULL;
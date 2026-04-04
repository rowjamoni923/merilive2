
-- 1. Create gift_categories table
CREATE TABLE IF NOT EXISTS public.gift_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  icon_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gift_categories ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can view gift categories"
  ON public.gift_categories FOR SELECT
  USING (true);

-- Insert default categories
INSERT INTO public.gift_categories (name, display_order) VALUES
  ('popular', 1),
  ('love', 2),
  ('luxury', 3),
  ('funny', 4),
  ('party', 5)
ON CONFLICT DO NOTHING;

-- 2. Add coin_price as alias column (view) since Android app expects coin_price but DB has coin_value
-- We'll add a generated column instead
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'gifts' AND column_name = 'coin_price'
  ) THEN
    ALTER TABLE public.gifts ADD COLUMN coin_price INTEGER GENERATED ALWAYS AS (coin_value) STORED;
  END IF;
END $$;

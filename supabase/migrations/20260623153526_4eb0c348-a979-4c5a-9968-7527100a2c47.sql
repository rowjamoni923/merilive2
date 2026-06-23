ALTER TABLE public.limited_time_offers
  ADD COLUMN IF NOT EXISTS bonus_percentage integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badge_text text DEFAULT 'LIMITED TIME',
  ADD COLUMN IF NOT EXISTS total_claimed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_max_claims integer;
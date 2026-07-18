-- Remove exact duplicates keeping the earliest row per id
DELETE FROM public.game_providers a
USING public.game_providers b
WHERE a.id = b.id
  AND a.ctid > b.ctid;

-- Enforce uniqueness going forward
ALTER TABLE public.game_providers
  ADD CONSTRAINT game_providers_pkey PRIMARY KEY (id);
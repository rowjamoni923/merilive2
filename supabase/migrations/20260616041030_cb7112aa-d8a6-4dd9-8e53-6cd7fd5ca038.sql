
-- ============================================================
-- COST FIX: Aggressive Cache-Control on immutable storage assets
-- Reduces Cached Egress by ~80-90% (industry standard for Chamet/Bigo class apps)
-- ============================================================

-- 1) Backfill existing objects in immutable-asset buckets with 1-year cache
UPDATE storage.objects 
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"cacheControl":"public, max-age=31536000, immutable"}'::jsonb
WHERE bucket_id IN (
  'gifts',              -- VAP/SVGA gift animations (681 MB, hottest)
  'animations',         -- Entry/effect animations (162 MB)
  'shop-items',         -- Shop UI assets (451 MB)
  'avatars',            -- User avatars (63 MB)
  'frames',             -- Avatar frames (22 MB)
  'banners',            -- Entry banners (19 MB)
  'level-assets',       -- Level badges (18 MB)
  'vehicle-entrances',  -- Vehicle entrance effects
  'party-backgrounds',  -- Party room backgrounds (64 MB)
  'posters',            -- Live/event posters (68 MB)
  'branding',           -- App branding (74 MB)
  'app-assets',         -- General app assets
  'assets'              -- Misc assets
)
AND (
  metadata IS NULL 
  OR metadata->>'cacheControl' IS NULL 
  OR metadata->>'cacheControl' NOT LIKE '%max-age=31536000%'
);

-- 2) Medium cache (7 days) for semi-dynamic content
UPDATE storage.objects 
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"cacheControl":"public, max-age=604800"}'::jsonb
WHERE bucket_id IN (
  'chat-media',         -- Chat images (136 MB) — content stable but may be deleted
  'reels'               -- User reels (27 MB)
)
AND (
  metadata IS NULL 
  OR metadata->>'cacheControl' IS NULL 
  OR metadata->>'cacheControl' NOT LIKE '%max-age=604800%'
);

-- 3) Short cache (1 hour) for verification/private content
UPDATE storage.objects 
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"cacheControl":"private, max-age=3600"}'::jsonb
WHERE bucket_id IN (
  'face-verification',
  'host-verification',
  'payment-proofs',
  'support-attachments',
  'rating-screenshots'
)
AND (
  metadata IS NULL 
  OR metadata->>'cacheControl' IS NULL
);

-- 4) Future-proof: trigger to auto-set cacheControl on new uploads
CREATE OR REPLACE FUNCTION public.set_storage_cache_control()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  -- Skip if already set
  IF NEW.metadata IS NOT NULL AND NEW.metadata->>'cacheControl' IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Immutable asset buckets → 1 year
  IF NEW.bucket_id IN (
    'gifts','animations','shop-items','avatars','frames','banners',
    'level-assets','vehicle-entrances','party-backgrounds','posters',
    'branding','app-assets','assets'
  ) THEN
    NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) 
      || '{"cacheControl":"public, max-age=31536000, immutable"}'::jsonb;
  -- Semi-dynamic → 7 days
  ELSIF NEW.bucket_id IN ('chat-media','reels') THEN
    NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) 
      || '{"cacheControl":"public, max-age=604800"}'::jsonb;
  -- Private/verification → 1 hour
  ELSIF NEW.bucket_id IN (
    'face-verification','host-verification','payment-proofs',
    'support-attachments','rating-screenshots'
  ) THEN
    NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) 
      || '{"cacheControl":"private, max-age=3600"}'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_set_cache_control ON storage.objects;
CREATE TRIGGER auto_set_cache_control
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_storage_cache_control();

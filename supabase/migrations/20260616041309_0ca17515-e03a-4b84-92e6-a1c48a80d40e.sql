
-- Backfill missed bucket
UPDATE storage.objects 
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"cacheControl":"public, max-age=31536000, immutable"}'::jsonb
WHERE bucket_id = 'payment-logos'
AND (metadata IS NULL OR metadata->>'cacheControl' IS NULL);

-- Update trigger function to include payment-logos
CREATE OR REPLACE FUNCTION public.set_storage_cache_control()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF NEW.metadata IS NOT NULL AND NEW.metadata->>'cacheControl' IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.bucket_id IN (
    'gifts','animations','shop-items','avatars','frames','banners',
    'level-assets','vehicle-entrances','party-backgrounds','posters',
    'branding','app-assets','assets','payment-logos'
  ) THEN
    NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) 
      || '{"cacheControl":"public, max-age=31536000, immutable"}'::jsonb;
  ELSIF NEW.bucket_id IN ('chat-media','reels') THEN
    NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) 
      || '{"cacheControl":"public, max-age=604800"}'::jsonb;
  ELSIF NEW.bucket_id IN (
    'face-verification','host-verification','payment-proofs',
    'support-attachments','rating-screenshots'
  ) THEN
    NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) 
      || '{"cacheControl":"private, max-age=3600"}'::jsonb;
  ELSE
    -- Catch-all: any future bucket gets 1-day public cache as safe default
    NEW.metadata = COALESCE(NEW.metadata, '{}'::jsonb) 
      || '{"cacheControl":"public, max-age=86400"}'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

-- Also backfill ANY remaining file in ANY bucket that still has no cache control
UPDATE storage.objects 
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"cacheControl":"public, max-age=86400"}'::jsonb
WHERE metadata IS NULL OR metadata->>'cacheControl' IS NULL;

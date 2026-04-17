-- Backfill missing image and animation URLs from existing fallback columns
UPDATE public.shop_items 
SET image_url = preview_url 
WHERE (image_url IS NULL OR image_url = '') 
  AND preview_url IS NOT NULL AND preview_url <> '';

UPDATE public.shop_items 
SET animation_url = preview_url 
WHERE (animation_url IS NULL OR animation_url = '') 
  AND preview_url IS NOT NULL AND preview_url <> '';

UPDATE public.avatar_frames 
SET animation_url = frame_url 
WHERE (animation_url IS NULL OR animation_url = '') 
  AND frame_url IS NOT NULL AND frame_url <> '';

UPDATE public.avatar_frames 
SET preview_url = COALESCE(NULLIF(image_url,''), frame_url) 
WHERE (preview_url IS NULL OR preview_url = '');
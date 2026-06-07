
-- ============================================================
-- EGRESS FIX: Long-cache immutable storage assets (30 days)
-- ============================================================
-- Problem: Supabase default cache-control = max-age=3600 (1 hour)
-- → every user re-downloads same gift/animation/frame every hour
-- → 300GB+ egress/month
--
-- Fix: Animation/gift/effect/frame buckets contain immutable content
-- (URL changes when file changes — same URL = same bytes forever).
-- Set 30-day cache + immutable hint so CDN + browser cache aggressively.
-- Expected egress reduction: 70-85%.
--
-- User-content buckets (avatars, chat-media, face-verification,
-- host-verification, payment-proofs, rating-screenshots, support-attachments)
-- KEEP 1-hour cache because they can be replaced/updated.
-- ============================================================

UPDATE storage.objects
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{cacheControl}',
  '"public, max-age=2592000, immutable"'::jsonb
)
WHERE bucket_id IN (
  'gifts',
  'animations',
  'frames',
  'party-backgrounds',
  'vehicle-entrances',
  'level-assets',
  'banners',
  'posters',
  'branding',
  'app-assets',
  'payment-logos',
  'shop-items',
  'reels',
  'assets'
)
AND (metadata->>'cacheControl' IS NULL
     OR metadata->>'cacheControl' NOT LIKE '%2592000%');

-- Also update the user_metadata field that Supabase storage reads on serve
UPDATE storage.objects
SET user_metadata = jsonb_set(
  COALESCE(user_metadata, '{}'::jsonb),
  '{cacheControl}',
  '"public, max-age=2592000, immutable"'::jsonb
)
WHERE bucket_id IN (
  'gifts',
  'animations',
  'frames',
  'party-backgrounds',
  'vehicle-entrances',
  'level-assets',
  'banners',
  'posters',
  'branding',
  'app-assets',
  'payment-logos',
  'shop-items',
  'reels',
  'assets'
);

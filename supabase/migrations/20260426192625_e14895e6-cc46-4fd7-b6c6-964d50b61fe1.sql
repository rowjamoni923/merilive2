-- =====================================================================
-- UNIVERSAL ADMIN STORAGE ACCESS
-- Allows the admin panel (custom session via x-admin-token header) to
-- upload / update / delete files in ANY storage bucket. Public read
-- access is already in place for all public buckets.
-- =====================================================================

-- Drop the old branding-only policies (now redundant with universal ones)
DROP POLICY IF EXISTS "Admin session can upload branding" ON storage.objects;
DROP POLICY IF EXISTS "Admin session can update branding" ON storage.objects;
DROP POLICY IF EXISTS "Admin session can delete branding" ON storage.objects;

-- Universal admin upload (any bucket)
CREATE POLICY "Admin session can upload to any bucket"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (public.is_active_admin_session());

-- Universal admin update (any bucket)
CREATE POLICY "Admin session can update any object"
ON storage.objects
FOR UPDATE
TO public
USING (public.is_active_admin_session())
WITH CHECK (public.is_active_admin_session());

-- Universal admin delete (any bucket) -- this is what enables the
-- "remove" buttons in the admin panel to actually work.
CREATE POLICY "Admin session can delete any object"
ON storage.objects
FOR DELETE
TO public
USING (public.is_active_admin_session());

-- =====================================================================
-- BUCKET LIMITS & MIME TYPES
-- Raise limits and explicitly allow modern formats (GIF, WebP, AVIF,
-- video, Lottie JSON, SVGA) for buckets the admin panel writes to.
-- =====================================================================

UPDATE storage.buckets
SET 
  file_size_limit = 52428800, -- 50MB
  allowed_mime_types = ARRAY[
    'image/png','image/jpeg','image/jpg','image/webp','image/gif','image/avif','image/bmp','image/svg+xml','image/apng',
    'video/mp4','video/webm','video/quicktime','video/x-m4v',
    'application/json','application/octet-stream'
  ]
WHERE id IN (
  'gifts','avatar_frames','frames','banners','banners-media','entry-banners',
  'entry-bars','entry-name-bars','vehicle-entrances','vip-medals','medals',
  'noble-cards','chat-bubbles','chat_bubbles','event-themes','party-backgrounds',
  'pk-backgrounds','app-icons','app-assets','assets','animations','svga-animations',
  'shop-items','stickers','ar-stickers','beauty-filters','sounds','games',
  'level-assets','payment-logos','payment-gateway-logos','channel-logos',
  'posters','backgrounds','media','media-files','reels'
);

-- Branding bucket already configured in previous migration — re-assert
UPDATE storage.buckets
SET 
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/png','image/jpeg','image/jpg','image/webp','image/gif','image/avif','image/bmp','image/svg+xml',
    'video/mp4','video/webm','video/quicktime','video/x-m4v'
  ]
WHERE id = 'branding';
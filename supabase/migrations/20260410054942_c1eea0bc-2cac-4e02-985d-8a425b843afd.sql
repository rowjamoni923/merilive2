
-- Create all missing storage buckets from old project
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars', 'avatars', true),
  ('branding', 'branding', true),
  ('chat-media', 'chat-media', true),
  ('chat-bubbles', 'chat-bubbles', true),
  ('face-verification', 'face-verification', true),
  ('frames', 'frames', true),
  ('animations', 'animations', true),
  ('sounds', 'sounds', true),
  ('host-verification', 'host-verification', true),
  ('level-assets', 'level-assets', true),
  ('live-recordings', 'live-recordings', false),
  ('payment-proofs', 'payment-proofs', true),
  ('payment-gateway-logos', 'payment-gateway-logos', true),
  ('posters', 'posters', true),
  ('reels', 'reels', true),
  ('shop-items', 'shop-items', true),
  ('pk-backgrounds', 'pk-backgrounds', true),
  ('gifts', 'gifts', true),
  ('banners-media', 'banners-media', true),
  ('profile-photos', 'profile-photos', true),
  ('voice-messages', 'voice-messages', true),
  ('stickers', 'stickers', true),
  ('beauty-filters', 'beauty-filters', true),
  ('ar-stickers', 'ar-stickers', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for all public buckets
CREATE POLICY "Public read access for all public buckets"
ON storage.objects FOR SELECT
USING (bucket_id IN (
  'avatars','branding','chat-media','chat-bubbles','face-verification',
  'frames','animations','sounds','host-verification','level-assets',
  'payment-proofs','payment-gateway-logos','posters','reels','shop-items',
  'pk-backgrounds','gifts','banners-media','profile-photos','stickers',
  'beauty-filters','ar-stickers','app-assets','channel-logos','content-media','media-files'
));

-- Authenticated users can upload to any bucket
CREATE POLICY "Authenticated users can upload files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (true);

-- Authenticated users can update their own files
CREATE POLICY "Authenticated users can update files"
ON storage.objects FOR UPDATE
TO authenticated
USING (true);

-- Authenticated users can delete their own files
CREATE POLICY "Authenticated users can delete files"
ON storage.objects FOR DELETE
TO authenticated
USING (true);

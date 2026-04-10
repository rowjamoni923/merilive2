INSERT INTO storage.buckets (id, name, public) VALUES
  ('vip-medals', 'vip-medals', true),
  ('noble-cards', 'noble-cards', true),
  ('payment-logos', 'payment-logos', true),
  ('payment-screenshots', 'payment-screenshots', true),
  ('helper-screenshots', 'helper-screenshots', true),
  ('party-backgrounds', 'party-backgrounds', true),
  ('assets', 'assets', true),
  ('vehicle-entrances', 'vehicle-entrances', true),
  ('banners', 'banners', true),
  ('support-attachments', 'support-attachments', true),
  ('rating-screenshots', 'rating-screenshots', true),
  ('games', 'games', true),
  ('app-icons', 'app-icons', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for new buckets
DO $$
BEGIN
  -- Drop and recreate the policy to include new buckets
  DROP POLICY IF EXISTS "Public read access for all public buckets" ON storage.objects;
  
  CREATE POLICY "Public read access for all public buckets"
  ON storage.objects FOR SELECT
  USING (bucket_id IN (
    'avatars','branding','chat-media','chat-bubbles','face-verification',
    'frames','animations','sounds','host-verification','level-assets',
    'payment-proofs','payment-gateway-logos','posters','reels','shop-items',
    'pk-backgrounds','gifts','banners-media','profile-photos','stickers',
    'beauty-filters','ar-stickers','app-assets','channel-logos','content-media',
    'media-files','vip-medals','noble-cards','payment-logos','payment-screenshots',
    'helper-screenshots','party-backgrounds','assets','vehicle-entrances',
    'banners','support-attachments','rating-screenshots','games','app-icons',
    'live-recordings','voice-messages'
  ));
END$$;
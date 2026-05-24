-- Drop the ineffective public-read policy (Supabase /object/public requires bucket.public=true; RLS doesn't help there).
DROP POLICY IF EXISTS "Public read chat-media gifts folder" ON storage.objects;

-- Rewrite gifts table URLs: /storage/v1/object/public/chat-media/gifts/<file>
--                        →  /functions/v1/public-gift-media/gifts/<file>
-- The public-gift-media edge fn proxies these files publicly using service-role read,
-- so chat-media bucket can remain private without breaking gift media delivery.
UPDATE public.gifts
SET
  icon_url      = regexp_replace(icon_url,      '/storage/v1/object/public/chat-media/gifts/', '/functions/v1/public-gift-media/gifts/'),
  animation_url = regexp_replace(animation_url, '/storage/v1/object/public/chat-media/gifts/', '/functions/v1/public-gift-media/gifts/'),
  sound_url     = regexp_replace(sound_url,     '/storage/v1/object/public/chat-media/gifts/', '/functions/v1/public-gift-media/gifts/')
WHERE
     icon_url      ILIKE '%/storage/v1/object/public/chat-media/gifts/%'
  OR animation_url ILIKE '%/storage/v1/object/public/chat-media/gifts/%'
  OR sound_url     ILIKE '%/storage/v1/object/public/chat-media/gifts/%';

-- Rewrite old DM/party chat messages that embed broken gift URLs.
UPDATE public.messages
SET content = regexp_replace(content, '/storage/v1/object/public/chat-media/gifts/', '/functions/v1/public-gift-media/gifts/', 'g')
WHERE content ILIKE '%/storage/v1/object/public/chat-media/gifts/%';
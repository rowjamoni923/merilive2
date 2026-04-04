-- Update shop-items bucket to allow application/octet-stream for SVGA files
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/json', 'video/mp4', 'video/webm', 'application/octet-stream']
WHERE id = 'shop-items';

-- Also update chat-media bucket to allow application/octet-stream
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'application/json', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'application/octet-stream']
WHERE id = 'chat-media';
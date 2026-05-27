UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png','image/jpeg','image/jpg','image/webp','image/gif','image/avif','image/bmp','image/svg+xml','image/apng',
  'video/mp4','video/webm','video/quicktime','video/x-m4v',
  'application/json','application/octet-stream','application/zip','binary/octet-stream'
]
WHERE id IN ('frames','entry-name-bars','svga-animations','medals','vip-medals','noble-cards','entry-banners','entry-bars','chat-bubbles','chat_bubbles','gifts','vehicle-entrances','animations','avatar_frames');
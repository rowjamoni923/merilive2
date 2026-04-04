
-- Fix storage bucket file size limits for large SVGA/MP4 uploads

-- 1. Update vehicle-entrances bucket - set file size limit to 150MB and add mime types
UPDATE storage.buckets 
SET file_size_limit = 157286400,
    allowed_mime_types = ARRAY[
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm',
      'application/json', 'application/octet-stream'
    ]
WHERE id = 'vehicle-entrances';

-- 2. Update shop-items bucket - increase file size limit from 50MB to 150MB
UPDATE storage.buckets 
SET file_size_limit = 157286400
WHERE id = 'shop-items';

-- 3. Update animations bucket - increase from 100MB to 150MB for consistency
UPDATE storage.buckets 
SET file_size_limit = 157286400
WHERE id = 'animations';

-- 4. Update sounds bucket to ensure 150MB limit
UPDATE storage.buckets 
SET file_size_limit = 157286400
WHERE id = 'sounds';

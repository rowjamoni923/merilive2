-- Update chat-media bucket to allow 100MB file uploads
UPDATE storage.buckets 
SET file_size_limit = 104857600  -- 100MB in bytes
WHERE name = 'chat-media';

-- Update sounds bucket to allow 100MB file uploads
UPDATE storage.buckets 
SET file_size_limit = 104857600  -- 100MB in bytes
WHERE name = 'sounds';
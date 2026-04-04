-- Update chat-media bucket to allow 150MB files
UPDATE storage.buckets 
SET file_size_limit = 157286400  -- 150MB in bytes
WHERE id = 'chat-media';

-- Update sounds bucket to allow 150MB files  
UPDATE storage.buckets
SET file_size_limit = 157286400  -- 150MB in bytes
WHERE id = 'sounds';

-- Update avatars bucket if needed
UPDATE storage.buckets
SET file_size_limit = 157286400  -- 150MB in bytes
WHERE id = 'avatars';
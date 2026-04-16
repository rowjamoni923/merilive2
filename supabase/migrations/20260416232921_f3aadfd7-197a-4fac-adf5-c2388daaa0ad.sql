
-- Universal public read access for all public buckets
-- This fixes "image not loading" issues across the entire app

-- Drop any conflicting policy with same name (idempotent)
DROP POLICY IF EXISTS "Public buckets are readable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to public buckets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own files" ON storage.objects;

-- 1) PUBLIC READ for every bucket marked as public
CREATE POLICY "Public buckets are readable by everyone"
ON storage.objects
FOR SELECT
USING (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE public = true
  )
);

-- 2) Authenticated users can upload to public buckets
CREATE POLICY "Authenticated users can upload to public buckets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE public = true
  )
);

-- 3) Authenticated users can update their own files
CREATE POLICY "Authenticated users can update own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (auth.uid() = owner)
WITH CHECK (auth.uid() = owner);

-- 4) Authenticated users can delete their own files
CREATE POLICY "Authenticated users can delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (auth.uid() = owner);

-- 5) Admins can manage all storage objects
DROP POLICY IF EXISTS "Admins manage all storage objects" ON storage.objects;
CREATE POLICY "Admins manage all storage objects"
ON storage.objects
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

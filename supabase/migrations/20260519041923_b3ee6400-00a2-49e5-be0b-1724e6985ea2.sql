-- Pkg44: Lock face-verification + host-verification buckets to admin-only access.
-- RLS policies on storage.objects already enforce admin + owner-only reads;
-- flipping bucket.public = false removes the unauthenticated direct-URL path,
-- so the only way to read these is now: (a) active admin session, or (b) owner
-- reading their own folder via signed URL.
UPDATE storage.buckets
SET public = false
WHERE id IN ('face-verification', 'host-verification');
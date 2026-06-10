
-- Sub-wave 3B: drop broad anon SELECT policies that enabled bucket listing.
-- Public file serving continues via /object/public/{bucket}/{path} which bypasses RLS.

DROP POLICY IF EXISTS "Public read access for all public buckets" ON storage.objects;
DROP POLICY IF EXISTS "Public read for public buckets"            ON storage.objects;
DROP POLICY IF EXISTS "Public read access for level-assets"       ON storage.objects;
DROP POLICY IF EXISTS "Public read banners-media"                 ON storage.objects;
DROP POLICY IF EXISTS "Public can view media files"               ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view content media"             ON storage.objects;
DROP POLICY IF EXISTS "Channel logos are publicly accessible"     ON storage.objects;
DROP POLICY IF EXISTS "Pkg368 public read app-assets"             ON storage.objects;
DROP POLICY IF EXISTS "Pkg368 public read branding assets"        ON storage.objects;
